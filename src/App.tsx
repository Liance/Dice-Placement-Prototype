import { useEffect, useRef, useState } from 'react';
import { getCardDefinition } from './game/definitions';
import {
  attemptManualDiePlacement,
  attemptMoveCard,
  canPlaceDieInSlot,
  createInitialGameState,
  getCardStatus,
  getSlotRuleText,
  recomputeConnections,
  rollTrayDice,
  sanitizeLoadedState,
  tickGame
} from './game/engine';
import type { CardInstance, Die, GameState } from './game/types';
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

function StatusChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="status-chip">
      <span className="status-chip__label">{label}</span>
      <strong className="status-chip__value">{value}</strong>
    </div>
  );
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
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const latestStateRef = useRef(gameState);

  const connections = recomputeConnections(gameState.cards);
  const draggingDie = dragState?.type === 'die' ? dragState.die : null;
  const draggingCardId = dragState?.type === 'card' ? dragState.cardId : null;

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
    };

    const onPointerUp = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current) {
          return current;
        }

        if (current.type === 'die') {
          const dropTarget = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>('[data-slot-drop]');

          if (dropTarget?.dataset.slotDrop) {
            const [cardId, slotId] = dropTarget.dataset.slotDrop.split('::');
            setGameState((state) => attemptManualDiePlacement(state, current.die.id, cardId, slotId));
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

  const startCardDrag = (
    event: React.PointerEvent<HTMLElement>,
    card: CardInstance
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-no-card-drag="true"]')) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDragState({
      type: 'card',
      cardId: card.id,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    });
  };

  const discardPreview = gameState.discardPool.slice(-8);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-panel__header">
          <div>
            <p className="eyebrow">Dice Placement Idle RPG</p>
            <h1>Mobile board prototype</h1>
            <p className="lede">
              Roll dice into the tray, drop them into card slots, and let connected cards
              auto-route output through the grid.
            </p>
          </div>
          <a className="hero-panel__link" href="./lab/">
            Open UI Lab
          </a>
        </div>
        <div className="status-row">
          <StatusChip label="Score" value={gameState.score} />
          <StatusChip label="Discard" value={gameState.discardScore} />
          <StatusChip
            label="Tray"
            value={`${gameState.tray.length}/${MAX_TRAY_DICE}`}
          />
        </div>
      </section>

      <section className="board-panel">
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
              const isDragging = draggingCardId === card.id;

              return (
                <article
                  key={card.id}
                  className={`card ${status.isActive ? 'card--active' : 'card--inactive'} ${
                    isDragging ? 'card--ghosted' : ''
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
                  onPointerDown={(event) => startCardDrag(event, card)}
                >
                  <header className="card__header">
                    <div>
                      <h2>{definition.title}</h2>
                      <p>{definition.description}</p>
                    </div>
                    <span className="card__drag">drag</span>
                  </header>

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
                          const canAcceptDraggedDie =
                            draggingDie &&
                            die === null &&
                            canPlaceDieInSlot(draggingDie, slot.rule);
                          const blocksDraggedDie =
                            draggingDie &&
                            die === null &&
                            !canPlaceDieInSlot(draggingDie, slot.rule);

                          return (
                            <div
                              key={slot.id}
                              data-no-card-drag="true"
                              data-slot-drop={`${card.id}::${slot.id}`}
                              className={`slot ${
                                canAcceptDraggedDie ? 'slot--valid' : ''
                              } ${blocksDraggedDie ? 'slot--blocked' : ''}`}
                            >
                              <span className="slot__label">{slot.label}</span>
                              <span className="slot__rule">{getSlotRuleText(slot.rule)}</span>
                              <div className="slot__content">
                                {die ? <DieFace value={die.value} /> : <span className="slot__empty">Drop die</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="card__empty-state">
                        No manual slots.
                      </div>
                    )}
                  </div>

                  <div className="card__footer" data-no-card-drag="true">
                    <div className="buffer-strip">
                      <span className="buffer-strip__label">
                        Buffer {card.inputBuffer.length > 0 ? `(${card.inputBuffer.length})` : ''}
                      </span>
                      <div className="buffer-strip__dice">
                        {card.inputBuffer.length > 0 ? (
                          card.inputBuffer.slice(0, 6).map((die) => (
                            <span key={die.id} className="buffer-strip__token">
                              {die.value}
                            </span>
                          ))
                        ) : (
                          <span className="buffer-strip__empty">Empty</span>
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
                          ? 'Waiting for output link'
                          : `${Math.round(status.progressRatio * 100)}%`}
                      </span>
                    </div>

                    <div className="card__meta">
                      <span className={`card__pill ${status.hasConnectedInput ? 'card__pill--live' : ''}`}>
                        In {status.hasConnectedInput ? 'linked' : 'open'}
                      </span>
                      <span className={`card__pill ${status.hasConnectedOutput ? 'card__pill--live' : ''}`}>
                        Out {status.hasConnectedOutput ? 'linked' : 'open'}
                      </span>
                      {card.heldOutput.length > 0 ? (
                        <span className="card__pill card__pill--alert">
                          Holding {card.heldOutput.length}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {getCardDefinition(card.kind).inputEdges.map((edge) => (
                    <span
                      key={edge.id}
                      className={`port port--input port--${edge.side} ${
                        connections.inputToOutput[`${card.id}:${edge.id}`] ? 'port--connected' : ''
                      }`}
                      style={{ '--edge-index': edge.index } as React.CSSProperties}
                    />
                  ))}
                  {getCardDefinition(card.kind).outputEdges.map((edge) => (
                    <span
                      key={edge.id}
                      className={`port port--output port--${edge.side} ${
                        connections.outputToInput[`${card.id}:${edge.id}`] ? 'port--connected' : ''
                      }`}
                      style={{ '--edge-index': edge.index } as React.CSSProperties}
                    />
                  ))}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bottom-panel">
        <div className="discard-panel">
          <div>
            <p className="eyebrow">Discard Pool</p>
            <strong>{gameState.discardPool.length} dice removed</strong>
          </div>
          <div className="discard-panel__dice">
            {discardPreview.length > 0 ? (
              discardPreview.map((die) => (
                <span key={die.id} className="discard-panel__token">
                  {die.value}
                </span>
              ))
            ) : (
              <span className="discard-panel__empty">No discarded dice yet</span>
            )}
          </div>
        </div>

        <div className="tray-panel">
          <div className="tray-panel__header">
            <div>
              <p className="eyebrow">Dice Tray</p>
              <strong>Manual rolls feed the player tray</strong>
            </div>
            <button
              className="roll-button"
              type="button"
              onClick={() => setGameState((state) => rollTrayDice(state, MANUAL_ROLL_COUNT))}
              disabled={gameState.tray.length >= MAX_TRAY_DICE}
            >
              Roll 3 Dice
            </button>
          </div>

          <div className="tray-dice">
            {gameState.tray.map((die) => (
              <button
                key={die.id}
                type="button"
                className="tray-die"
                onPointerDown={(event) => startDieDrag(event, die)}
              >
                <DieFace value={die.value} rolling={gameState.timeMs - die.createdAt < 700} />
              </button>
            ))}
            {Array.from({ length: Math.max(0, MAX_TRAY_DICE - gameState.tray.length) }, (_, index) => (
              <span key={`empty-${index}`} className="tray-dice__empty">
                Empty
              </span>
            ))}
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
                {getCardDefinition(
                  gameState.cards.find((card) => card.id === dragState.cardId)?.kind ??
                    'generator'
                ).title}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
