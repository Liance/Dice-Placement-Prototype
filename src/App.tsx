import { useEffect, useRef, useState } from 'react';
import { getCardDefinition } from './game/definitions';
import {
  attemptManualDiePlacement,
  attemptMoveCard,
  createInitialGameState,
  getCardDropPreview,
  getCardStatus,
  getCompatibleTargets,
  getSlotRuleText,
  recomputeConnections,
  rollTrayDice,
  sanitizeLoadedState,
  tickGame
} from './game/engine';
import type { CardInstance, Die, GameState, SlotRule } from './game/types';
import {
  BOARD_COLS,
  BOARD_ROWS,
  MANUAL_ROLL_COUNT,
  MAX_TRAY_DICE,
  STORAGE_KEY
} from './game/types';
import './styles.css';

type DragState =
  | {
      type: 'die';
      die: Die;
      currentX: number;
      currentY: number;
      offsetX: number;
      offsetY: number;
    }
  | {
      type: 'card';
      cardId: string;
      currentX: number;
      currentY: number;
      offsetX: number;
      offsetY: number;
    };

type DropTarget = {
  cardId: string;
  slotId: string;
};

type PlacementFeedback = {
  id: number;
  cardId: string;
  summary: string;
  detail: string;
};

type CombatShellState = {
  turn: number;
  playerHp: number;
  playerHpMax: number;
  enemyHp: number;
  enemyHpMax: number;
  intentIndex: number;
  actingSide: 'player';
};

const ENEMY_INTENTS = [
  { label: 'Strike', value: 6, text: 'Direct hit next turn.' },
  { label: 'Guard', value: 4, text: 'Blocks incoming damage.' },
  { label: 'Shock', value: 2, text: 'Disrupts one loaded slot.' },
  { label: 'Recover', value: 5, text: 'Repairs lost armor.' }
];

function DieFace({ value, rolling }: { value: number; rolling?: boolean }) {
  return (
    <div className={`die ${rolling ? 'die--rolling' : ''}`}>
      <div className={`die__grid die__grid--${value}`}>
        {Array.from({ length: 9 }, (_, index) => {
          const activeIndexes: Record<number, number[]> = {
            1: [4],
            2: [0, 8],
            3: [0, 4, 8],
            4: [0, 2, 6, 8],
            5: [0, 2, 4, 6, 8],
            6: [0, 2, 3, 5, 6, 8]
          };

          return (
            <span
              key={index}
              className={`die__pip ${
                activeIndexes[value]?.includes(index) ? 'die__pip--on' : ''
              }`}
            />
          );
        })}
      </div>
      <span className="die__value">{value}</span>
    </div>
  );
}

function parseDropTarget(value: string | undefined): DropTarget | null {
  if (!value) {
    return null;
  }

  const [cardId, slotId] = value.split('::');
  if (!cardId || !slotId) {
    return null;
  }

  return { cardId, slotId };
}

function getRuleClass(rule: SlotRule): string {
  return `slot--rule-${rule.kind}`;
}

function getCardStateText(card: CardInstance, draggedDie: Die | null): string {
  if (draggedDie) {
    return `Drop ${draggedDie.value}`;
  }

  const definition = getCardDefinition(card.kind);
  if (card.heldOutput.length > 0) {
    return `Holding ${card.heldOutput.length}`;
  }

  if (definition.slotDefinitions.length === 0) {
    return 'Auto';
  }

  const filledSlots = card.slotDice.filter(Boolean).length;
  return `${filledSlots}/${definition.slotDefinitions.length} loaded`;
}

function getBoardPrompt(
  draggingDie: Die | null,
  hoveredPreview: { accepted: boolean; summary: string; detail: string } | null,
  compatibleCount: number,
  trayCount: number
): string {
  if (draggingDie && hoveredPreview) {
    return `${hoveredPreview.summary} · ${hoveredPreview.detail}`;
  }

  if (draggingDie && compatibleCount > 0) {
    return `Drop ${draggingDie.value} into a bright slot.`;
  }

  if (draggingDie) {
    return `No module can take ${draggingDie.value}.`;
  }

  if (trayCount === 0) {
    return 'Roll to refill your hand.';
  }

  return 'Drag a die into an active module.';
}

function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createInitialGameState();
    }

    try {
      return sanitizeLoadedState(JSON.parse(stored));
    } catch {
      return createInitialGameState();
    }
  });
  const [combatShell, setCombatShell] = useState<CombatShellState>({
    turn: 1,
    playerHp: 28,
    playerHpMax: 28,
    enemyHp: 42,
    enemyHpMax: 42,
    intentIndex: 0,
    actingSide: 'player'
  });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<DropTarget | null>(null);
  const [placementFeedback, setPlacementFeedback] = useState<PlacementFeedback | null>(
    null
  );
  const boardRef = useRef<HTMLDivElement | null>(null);
  const latestStateRef = useRef(gameState);

  const connections = recomputeConnections(gameState.cards);
  const draggingDie = dragState?.type === 'die' ? dragState.die : null;
  const draggingCardId = dragState?.type === 'card' ? dragState.cardId : null;
  const compatibleTargets = draggingDie ? getCompatibleTargets(gameState, draggingDie) : [];
  const compatibleSlotKeys = new Set(
    compatibleTargets.map((target) => `${target.cardId}:${target.slotId}`)
  );
  const compatibleCardIds = new Set(compatibleTargets.map((target) => target.cardId));
  const hoveredPreview =
    draggingDie && hoveredSlot
      ? getCardDropPreview(gameState, hoveredSlot.cardId, hoveredSlot.slotId, draggingDie)
      : null;
  const currentIntent = ENEMY_INTENTS[combatShell.intentIndex];
  const discardPreview = gameState.discardPool.slice(-5);
  const boardPrompt = getBoardPrompt(
    draggingDie,
    hoveredPreview,
    compatibleTargets.length,
    gameState.tray.length
  );

  useEffect(() => {
    latestStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latestStateRef.current));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latestStateRef.current));
    };
  }, []);

  useEffect(() => {
    if (!placementFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPlacementFeedback((current) =>
        current?.id === placementFeedback.id ? null : current
      );
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [placementFeedback]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();
    let accumulatedDelta = 0;

    const loop = (now: number) => {
      const delta = Math.min(now - previousTime, 120);
      previousTime = now;
      accumulatedDelta += delta;

      if (accumulatedDelta >= 50) {
        setGameState((current) => tickGame(current, accumulatedDelta));
        accumulatedDelta = 0;
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!dragState) {
      setHoveredSlot(null);
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      setDragState((current) =>
        current
          ? {
              ...current,
              currentX: event.clientX,
              currentY: event.clientY
            }
          : current
      );

      if (dragState.type !== 'die') {
        setHoveredSlot(null);
        return;
      }

      const rawTarget = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-slot-drop]')
        ?.dataset.slotDrop;

      setHoveredSlot(parseDropTarget(rawTarget));
    };

    const onPointerUp = (event: PointerEvent) => {
      const currentState = latestStateRef.current;

      setDragState((current) => {
        if (!current) {
          return current;
        }

        if (current.type === 'die') {
          const rawTarget = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>('[data-slot-drop]')
            ?.dataset.slotDrop;
          const target = parseDropTarget(rawTarget);

          if (target) {
            const preview = getCardDropPreview(
              currentState,
              target.cardId,
              target.slotId,
              current.die
            );

            if (preview.accepted) {
              setGameState((state) =>
                attemptManualDiePlacement(state, current.die.id, target.cardId, target.slotId)
              );
              setPlacementFeedback({
                id: Date.now(),
                cardId: target.cardId,
                summary: preview.summary,
                detail: preview.detail
              });
            }
          }
        }

        if (current.type === 'card' && boardRef.current) {
          const rect = boardRef.current.getBoundingClientRect();
          const cellWidth = rect.width / BOARD_COLS;
          const cellHeight = rect.height / BOARD_ROWS;
          const nextX = Math.round((event.clientX - rect.left - current.offsetX) / cellWidth);
          const nextY = Math.round((event.clientY - rect.top - current.offsetY) / cellHeight);

          setGameState((state) => attemptMoveCard(state, current.cardId, nextX, nextY));
        }

        return null;
      });

      setHoveredSlot(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState]);

  const startDieDrag = (event: React.PointerEvent<HTMLButtonElement>, die: Die) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDragState({
      type: 'die',
      die,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    });
  };

  const startCardDrag = (event: React.PointerEvent<HTMLButtonElement>, card: CardInstance) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDragState({
      type: 'card',
      cardId: card.id,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: rect.width / 2,
      offsetY: rect.height / 2
    });
  };

  const handleEndTurn = () => {
    setDragState(null);
    setHoveredSlot(null);
    setPlacementFeedback(null);
    setCombatShell((current) => ({
      ...current,
      turn: current.turn + 1,
      intentIndex: (current.intentIndex + 1) % ENEMY_INTENTS.length
    }));
  };

  return (
    <main className="combat-layout">
      <section className="combat-hud">
        <div className="turn-pillar">
          <span className="section-kicker">Turn</span>
          <strong>{combatShell.turn}</strong>
          <span className="turn-pillar__phase">Your move</span>
        </div>

        <div className="enemy-panel">
          <div className="enemy-panel__header">
            <div>
              <p className="section-kicker">Enemy</p>
              <h1>Clockwork Host</h1>
            </div>
            <div className="intent-readout">
              <span className="intent-readout__label">Intent</span>
              <strong>
                {currentIntent.label}
                {currentIntent.value ? ` ${currentIntent.value}` : ''}
              </strong>
            </div>
          </div>

          <div className="enemy-panel__body">
            <div className="hp-panel">
              <div className="hp-panel__row">
                <span>HP</span>
                <strong>
                  {combatShell.enemyHp}/{combatShell.enemyHpMax}
                </strong>
              </div>
              <div className="hp-bar">
                <span
                  className="hp-bar__fill hp-bar__fill--enemy"
                  style={{
                    width: `${
                      (combatShell.enemyHp / combatShell.enemyHpMax) * 100
                    }%`
                  }}
                />
              </div>
            </div>

            <p className="enemy-panel__text">{currentIntent.text}</p>
          </div>
        </div>

        <button className="end-turn-button" type="button" onClick={handleEndTurn}>
          End Turn
        </button>
      </section>

      <section className="board-band">
        <div className="board-band__header">
          <div>
            <p className="section-kicker">Modules</p>
            <h2>Combat board</h2>
          </div>
          <div className="board-band__prompt">{boardPrompt}</div>
        </div>

        <div className="board-frame">
          <div
            ref={boardRef}
            className="board"
            style={
              {
                '--board-cols': BOARD_COLS,
                '--board-rows': BOARD_ROWS
              } as React.CSSProperties
            }
          >
            {Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, index) => (
              <span key={index} className="board__cell" aria-hidden="true" />
            ))}

            {gameState.cards.map((card) => {
              const definition = getCardDefinition(card.kind);
              const status = getCardStatus(gameState, card);
              const isDraggingCard = draggingCardId === card.id;
              const isCompatibleCard = draggingDie ? compatibleCardIds.has(card.id) : false;
              const hoveredCard = hoveredSlot?.cardId === card.id;
              const feedback = placementFeedback?.cardId === card.id ? placementFeedback : null;
              const visualMode = draggingDie
                ? isCompatibleCard
                  ? 'card--focus'
                  : status.totalSlots > 0
                    ? 'card--blocked'
                    : 'card--recede'
                : status.isAwaitingOutput
                  ? 'card--queued'
                  : status.isReady && status.totalSlots > 0
                    ? 'card--ready'
                    : status.isActive
                      ? 'card--active'
                      : 'card--idle';

              return (
                <article
                  key={card.id}
                  className={`card ${visualMode} ${
                    hoveredCard ? 'card--hovered' : ''
                  } ${isDraggingCard ? 'card--ghosted' : ''} ${
                    feedback ? 'card--feedback' : ''
                  }`}
                  style={
                    {
                      '--x': card.x,
                      '--y': card.y,
                      '--w': definition.size.w,
                      '--h': definition.size.h,
                      '--card-color': definition.color,
                      '--card-accent': definition.accent
                    } as React.CSSProperties
                  }
                >
                  <header className="card__header">
                    <div className="card__title-group">
                      <h3>{definition.title}</h3>
                      <p className="card__rule">{definition.ruleText}</p>
                    </div>
                    <button
                      type="button"
                      className="card__handle"
                      onPointerDown={(event) => startCardDrag(event, card)}
                    >
                      Move
                    </button>
                  </header>

                  <p className="card__effect">{definition.effectText}</p>

                  <div className="card__state-row">
                    <span className="card__state">{getCardStateText(card, draggingDie)}</span>
                    <span className="card__count">
                      {status.totalSlots > 0 ? `${status.filledSlots}/${status.totalSlots}` : 'Auto'}
                    </span>
                  </div>

                  <div className="card__body">
                    {definition.slotDefinitions.length > 0 ? (
                      <div
                        className="slot-grid"
                        style={
                          {
                            '--slot-columns': definition.slotColumns
                          } as React.CSSProperties
                        }
                      >
                        {definition.slotDefinitions.map((slot, slotIndex) => {
                          const die = card.slotDice[slotIndex];
                          const slotKey = `${card.id}:${slot.id}`;
                          const isCompatibleSlot = draggingDie
                            ? compatibleSlotKeys.has(slotKey)
                            : false;
                          const isHoveredSlot =
                            hoveredSlot?.cardId === card.id &&
                            hoveredSlot.slotId === slot.id;
                          const preview =
                            draggingDie && isHoveredSlot
                              ? getCardDropPreview(gameState, card.id, slot.id, draggingDie)
                              : null;

                          return (
                            <div
                              key={slot.id}
                              data-slot-drop={`${card.id}::${slot.id}`}
                              className={`slot ${getRuleClass(slot.rule)} ${
                                die ? 'slot--filled' : ''
                              } ${isCompatibleSlot ? 'slot--valid' : ''} ${
                                draggingDie && !die && !isCompatibleSlot ? 'slot--blocked' : ''
                              } ${isHoveredSlot ? 'slot--hovered' : ''}`}
                            >
                              <span className="slot__condition">
                                {getSlotRuleText(slot.rule)}
                              </span>
                              <div className="slot__content">
                                {die ? (
                                  <DieFace value={die.value} />
                                ) : preview ? (
                                  <div
                                    className={`slot__preview ${
                                      preview.accepted
                                        ? 'slot__preview--valid'
                                        : 'slot__preview--blocked'
                                    }`}
                                  >
                                    <strong>{preview.summary}</strong>
                                    <span>{preview.detail}</span>
                                  </div>
                                ) : (
                                  <span className="slot__empty">Drop</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="card__auto-well">Auto module</div>
                    )}
                  </div>

                  <div className="card__footer">
                    <div className="queue-rail">
                      <span className="queue-rail__label">Queue</span>
                      <div className="queue-rail__track">
                        {card.inputBuffer.length > 0 ? (
                          card.inputBuffer.slice(0, 6).map((die) => (
                            <span key={die.id} className="queue-rail__token">
                              {die.value}
                            </span>
                          ))
                        ) : (
                          <span className="queue-rail__empty">Empty</span>
                        )}
                      </div>
                    </div>

                    <div className="progress-row">
                      <div className="progress-bar">
                        <span
                          className="progress-bar__fill"
                          style={{ width: `${status.progressRatio * 100}%` }}
                        />
                      </div>
                      <span className="progress-row__meta">
                        {status.isAwaitingOutput
                          ? 'Queued'
                          : `${Math.round(status.progressRatio * 100)}%`}
                      </span>
                    </div>
                  </div>

                  {feedback ? (
                    <div className="card__feedback">
                      <strong>{feedback.summary}</strong>
                      <span>{feedback.detail}</span>
                    </div>
                  ) : null}

                  {definition.inputEdges.map((edge) => (
                    <span
                      key={edge.id}
                      className={`port port--input port--${edge.side} ${
                        connections.inputToOutput[`${card.id}:${edge.id}`]
                          ? 'port--connected'
                          : ''
                      }`}
                      style={{ '--edge-index': edge.index } as React.CSSProperties}
                    >
                      IN
                    </span>
                  ))}
                  {definition.outputEdges.map((edge) => (
                    <span
                      key={edge.id}
                      className={`port port--output port--${edge.side} ${
                        connections.outputToInput[`${card.id}:${edge.id}`]
                          ? 'port--connected'
                          : ''
                      }`}
                      style={{ '--edge-index': edge.index } as React.CSSProperties}
                    >
                      OUT
                    </span>
                  ))}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="player-dock">
        <div className="player-panel">
          <div className="player-panel__header">
            <div>
              <p className="section-kicker">Player</p>
              <h2>Dice hand</h2>
            </div>
            <span className="player-panel__phase">Acting now</span>
          </div>

          <div className="hp-panel">
            <div className="hp-panel__row">
              <span>HP</span>
              <strong>
                {combatShell.playerHp}/{combatShell.playerHpMax}
              </strong>
            </div>
            <div className="hp-bar">
              <span
                className="hp-bar__fill hp-bar__fill--player"
                style={{
                  width: `${(combatShell.playerHp / combatShell.playerHpMax) * 100}%`
                }}
              />
            </div>
          </div>

          <div className="player-panel__stats">
            <div className="mini-stat">
              <span>Score</span>
              <strong>{gameState.score}</strong>
            </div>
            <div className="mini-stat">
              <span>Discard</span>
              <strong>{gameState.discardScore}</strong>
            </div>
          </div>

          <div className="discard-strip">
            <span className="discard-strip__label">Recent discards</span>
            <div className="discard-strip__track">
              {discardPreview.length > 0 ? (
                discardPreview.map((die) => (
                  <span key={die.id} className="discard-strip__token">
                    {die.value}
                  </span>
                ))
              ) : (
                <span className="discard-strip__empty">None</span>
              )}
            </div>
          </div>
        </div>

        <div className="tray-panel">
          <div className="tray-panel__header">
            <div>
              <p className="section-kicker">Hand</p>
              <h2>Available dice</h2>
            </div>

            <div className="tray-panel__controls">
              <span className="tray-panel__count">
                {gameState.tray.length}/{MAX_TRAY_DICE}
              </span>
              <button
                className="roll-button"
                type="button"
                onClick={() => setGameState((state) => rollTrayDice(state, MANUAL_ROLL_COUNT))}
                disabled={gameState.tray.length >= MAX_TRAY_DICE}
              >
                Roll 3
              </button>
            </div>
          </div>

          <div className="tray-shelf">
            {gameState.tray.map((die) => (
              <button
                key={die.id}
                type="button"
                className={`tray-die ${
                  draggingDie?.id === die.id ? 'tray-die--dragging' : ''
                }`}
                onPointerDown={(event) => startDieDrag(event, die)}
              >
                <DieFace value={die.value} rolling={gameState.timeMs - die.createdAt < 700} />
              </button>
            ))}

            {Array.from(
              { length: Math.max(0, MAX_TRAY_DICE - gameState.tray.length) },
              (_, index) => (
                <span key={`empty-${index}`} className="tray-slot">
                  Empty
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {dragState ? (
        <div className="drag-layer" aria-hidden="true">
          <div
            className={`drag-ghost drag-ghost--${dragState.type}`}
            style={{
              transform: `translate(${dragState.currentX - dragState.offsetX}px, ${
                dragState.currentY - dragState.offsetY
              }px)`
            }}
          >
            {dragState.type === 'die' ? (
              <DieFace value={dragState.die.value} />
            ) : (
              <div className="drag-ghost__card">
                {
                  getCardDefinition(
                    gameState.cards.find((card) => card.id === dragState.cardId)?.kind ??
                      'generator'
                  ).title
                }
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
