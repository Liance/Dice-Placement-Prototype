import { useEffect, useMemo, useState } from 'react';
import { LAB_SCENARIOS, LAB_STORAGE_KEY } from './mockData';
import type { LabModule, LabScenario, LabSlot } from './types';
import { DieFace } from '../ui/DieFace';
import './styles.css';

type LabState = {
  scenarioId: string;
  tray: number[];
  modules: LabModule[];
  feedback: string | null;
  rollingDiceIds: string[];
};

type LabDragState = {
  dieIndex: number;
  value: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
  hoverTarget: LabDropTarget | null;
};

type LabDropTarget = {
  moduleId: string;
  slotId: string;
};

function cloneScenario(scenario: LabScenario): LabState {
  const tray = [...scenario.tray];
  return {
    scenarioId: scenario.id,
    tray,
    modules: structuredClone(scenario.modules),
    feedback: null,
    rollingDiceIds: tray.map((_, index) => `tray-${index}`)
  };
}

function getScenario(id: string): LabScenario {
  return LAB_SCENARIOS.find((scenario) => scenario.id === id) ?? LAB_SCENARIOS[0];
}

function canPlaceDie(value: number, slot: LabSlot): boolean {
  switch (slot.kind) {
    case 'open':
      return true;
    case 'odd':
      return value % 2 === 1;
    case 'even':
      return value % 2 === 0;
    case 'exact':
      return value === slot.exactValue;
    case 'min':
      return value >= (slot.minValue ?? 0);
    case 'max':
      return value <= (slot.maxValue ?? 6);
  }
}

function slotStateClass(
  slot: LabSlot,
  draggingValue: number | null,
  isHovered: boolean
): string {
  if (slot.die !== null) {
    return 'lab-slot--filled';
  }

  if (draggingValue === null) {
    return isHovered ? 'lab-slot--hovered' : '';
  }

  if (canPlaceDie(draggingValue, slot)) {
    return isHovered ? 'lab-slot--hovered lab-slot--valid' : 'lab-slot--valid';
  }

  return isHovered ? 'lab-slot--hovered lab-slot--blocked' : 'lab-slot--blocked';
}

function App() {
  const [state, setState] = useState<LabState>(() => {
    const stored = localStorage.getItem(LAB_STORAGE_KEY);
    if (!stored) {
      return cloneScenario(LAB_SCENARIOS[0]);
    }

    try {
      const parsed = JSON.parse(stored) as LabState;
      const scenario = getScenario(parsed.scenarioId);
      return {
        scenarioId: scenario.id,
        tray: Array.isArray(parsed.tray) ? parsed.tray : [...scenario.tray],
        modules: Array.isArray(parsed.modules)
          ? parsed.modules
          : structuredClone(scenario.modules),
        feedback: null,
        rollingDiceIds: []
      };
    } catch {
      return cloneScenario(LAB_SCENARIOS[0]);
    }
  });
  const [dragState, setDragState] = useState<LabDragState | null>(null);

  const currentScenario = getScenario(state.scenarioId);
  const compatibleTargets = useMemo(() => {
    if (!dragState) {
      return new Set<string>();
    }

    return new Set(
      state.modules.flatMap((module) =>
        module.slots
          .filter((slot) => slot.die === null && canPlaceDie(dragState.value, slot))
          .map((slot) => `${module.id}::${slot.id}`)
      )
    );
  }, [dragState, state.modules]);

  useEffect(() => {
    localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state.feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => ({ ...current, feedback: null }));
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [state.feedback]);

  useEffect(() => {
    if (state.rollingDiceIds.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => ({ ...current, rollingDiceIds: [] }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [state.rollingDiceIds]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const dropTarget = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-slot-drop]');

      const hoverTarget = dropTarget?.dataset.slotDrop
        ? (() => {
            const [moduleId, slotId] = dropTarget.dataset.slotDrop.split('::');
            return { moduleId, slotId };
          })()
        : null;

      setDragState((current) =>
        current
          ? {
              ...current,
              currentX: event.clientX,
              currentY: event.clientY,
              hoverTarget
            }
          : current
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      const dropTarget = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-slot-drop]');

      setState((current) => {
        const activeDrag = dragState;
        if (!activeDrag) {
          return current;
        }

        if (!dropTarget?.dataset.slotDrop) {
          return { ...current, feedback: 'Die returned to hand' };
        }

        const [moduleId, slotId] = dropTarget.dataset.slotDrop.split('::');
        const next = structuredClone(current) as LabState;
        const module = next.modules.find((item) => item.id === moduleId);
        const slot = module?.slots.find((item) => item.id === slotId);
        const trayValue = next.tray[activeDrag.dieIndex];

        if (!module || !slot || trayValue === undefined || slot.die !== null) {
          return { ...current, feedback: 'Blocked' };
        }

        if (!canPlaceDie(trayValue, slot)) {
          next.feedback = `Blocked: ${slot.requirement}`;
          return next;
        }

        slot.die = trayValue;
        next.tray.splice(activeDrag.dieIndex, 1);
        next.feedback = `Placed ${trayValue} into ${module.title}`;
        return next;
      });

      setDragState(null);
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

  const resetScenario = (scenarioId: string) => {
    setState(cloneScenario(getScenario(scenarioId)));
    setDragState(null);
  };

  const startDieDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number, value: number) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDragState({
      dieIndex: index,
      value,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      hoverTarget: null
    });
  };

  const handleSlotTap = (moduleId: string, slotId: string) => {
    setState((current) => {
      const next = structuredClone(current) as LabState;
      const module = next.modules.find((item) => item.id === moduleId);
      if (!module) {
        return current;
      }

      const slot = module.slots.find((item) => item.id === slotId);
      if (!slot) {
        return current;
      }

      if (slot.die !== null) {
        next.tray.push(slot.die);
        slot.die = null;
        next.rollingDiceIds = [`tray-${next.tray.length - 1}`];
        next.feedback = 'Returned die to hand';
        return next;
      }

      next.feedback = 'Drag a die here';
      return next;
    });
  };

  return (
    <main className="lab-shell">
      <section className="lab-scroll">
        <header className="lab-topbar">
          <div>
            <span className="lab-badge">LAB</span>
            <h1>Dice Placement UI Lab</h1>
            <p className="lab-topbar__text">
              Isolated mockup space. Drag dice like the live app. Nothing here touches
              the live game engine.
            </p>
          </div>
          <div className="lab-topbar__actions">
            <a className="lab-link" href="../">
              Playable Prototype
            </a>
            <button
              className="lab-secondary-button"
              type="button"
              onClick={() => resetScenario(state.scenarioId)}
            >
              Reset
            </button>
          </div>
        </header>

        <section className="lab-scenarios">
          {LAB_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={`lab-scenario-chip ${
                scenario.id === state.scenarioId ? 'lab-scenario-chip--active' : ''
              }`}
              onClick={() => resetScenario(scenario.id)}
            >
              <strong>{scenario.name}</strong>
              <span>{scenario.description}</span>
            </button>
          ))}
        </section>

        <section className="lab-board">
          <div className="lab-enemy">
            <div className="lab-enemy__header">
              <div>
                <p className="lab-eyebrow">Enemy</p>
                <h2>{currentScenario.enemy.name}</h2>
              </div>
              <div className="lab-enemy__intent">{currentScenario.enemy.intent}</div>
            </div>
            <div className="lab-bar">
              <span className="lab-bar__label">HP</span>
              <div className="lab-bar__track">
                <span
                  className="lab-bar__fill lab-bar__fill--enemy"
                  style={{
                    width: `${
                      (currentScenario.enemy.hp / currentScenario.enemy.hpMax) * 100
                    }%`
                  }}
                />
              </div>
              <strong>
                {currentScenario.enemy.hp}/{currentScenario.enemy.hpMax}
              </strong>
            </div>
            <p className="lab-enemy__note">{currentScenario.enemy.note}</p>
          </div>

          <div className="lab-modules">
            {state.modules.map((module) => {
              const moduleCanReceive = module.slots.some((slot) =>
                compatibleTargets.has(`${module.id}::${slot.id}`)
              );

              return (
                <article
                  key={module.id}
                  className={`lab-module lab-module--${module.state} ${
                    dragState ? (moduleCanReceive ? 'lab-module--focus' : 'lab-module--recede') : ''
                  }`}
                >
                  <header className="lab-module__header">
                    <div>
                      <h3>{module.title}</h3>
                      <p>{module.ruleText}</p>
                    </div>
                    <span className="lab-module__state">{module.state}</span>
                  </header>

                  <p className="lab-module__effect">{module.effectText}</p>

                  {module.slots.length > 0 ? (
                    <div className="lab-module__slots">
                      {module.slots.map((slot) => {
                      const slotKey = `${module.id}::${slot.id}`;
                      const isHovered =
                        dragState?.hoverTarget?.moduleId === module.id &&
                        dragState?.hoverTarget?.slotId === slot.id;
                      const isCompatible = compatibleTargets.has(slotKey);
                      const canReceive = dragState ? isCompatible : false;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          className={`lab-slot ${slotStateClass(
                            slot,
                            dragState?.value ?? null,
                            isHovered
                          )}`}
                          data-slot-drop={slotKey}
                          data-slot-compatible={canReceive ? 'true' : 'false'}
                          onClick={() => handleSlotTap(module.id, slot.id)}
                        >
                          <span className="lab-slot__requirement">{slot.requirement}</span>
                          <div className="lab-slot__body">
                            {slot.die !== null ? (
                              <DieFace value={slot.die} />
                            ) : (
                              <span>{isHovered && canReceive ? 'Release' : 'Drop'}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="lab-module__auto">Auto module</div>
                  )}

                  <div className="lab-module__footer">
                    <div className="lab-bar lab-bar--compact">
                      <span className="lab-bar__label">Charge</span>
                      <div className="lab-bar__track">
                        <span
                          className="lab-bar__fill lab-bar__fill--module"
                          style={{ width: `${module.progress * 100}%` }}
                        />
                      </div>
                      <strong>{Math.round(module.progress * 100)}%</strong>
                    </div>
                    <div className="lab-queue">
                      <span className="lab-queue__label">Queue</span>
                      <div className="lab-queue__track">
                        {module.queue.length > 0 ? (
                          module.queue.map((value, index) => (
                            <span key={`${module.id}-${index}`} className="lab-queue__token">
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className="lab-queue__empty">Empty</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="lab-hand">
        <div className="lab-player">
          <div className="lab-player__header">
            <div>
              <p className="lab-eyebrow">Player</p>
              <h2>Phone test state</h2>
            </div>
            <span className="lab-player__turn">Turn {currentScenario.player.turn}</span>
          </div>

          <div className="lab-bar">
            <span className="lab-bar__label">HP</span>
            <div className="lab-bar__track">
              <span
                className="lab-bar__fill lab-bar__fill--player"
                style={{
                  width: `${
                    (currentScenario.player.hp / currentScenario.player.hpMax) * 100
                  }%`
                }}
              />
            </div>
            <strong>
              {currentScenario.player.hp}/{currentScenario.player.hpMax}
            </strong>
          </div>

          <p className="lab-feedback">
            {state.feedback ?? 'Drag a die to any highlighted slot.'}
          </p>
        </div>

        <div className="lab-tray">
          <div className="lab-tray__header">
            <div>
              <p className="lab-eyebrow">Hand</p>
              <h2>Drag-ready dice</h2>
            </div>
            <span className="lab-tray__count">{state.tray.length} dice</span>
          </div>
          <div className="lab-tray__grid">
            {state.tray.map((value, index) => (
              <button
                key={`${value}-${index}`}
                type="button"
                className={`lab-tray__die ${
                  dragState?.dieIndex === index ? 'lab-tray__die--active' : ''
                }`}
                onPointerDown={(event) => startDieDrag(event, index, value)}
              >
                <DieFace
                  value={value}
                  rolling={state.rollingDiceIds.includes(`tray-${index}`)}
                />
              </button>
            ))}
            {state.tray.length === 0 ? (
              <div className="lab-tray__empty">Scenario hand is empty.</div>
            ) : null}
          </div>
        </div>
      </section>

      {dragState ? (
        <div className="lab-drag-layer" aria-hidden="true">
          <div
            className="lab-drag-ghost"
            style={{
              transform: `translate(${dragState.currentX - dragState.offsetX}px, ${
                dragState.currentY - dragState.offsetY
              }px)`
            }}
          >
            <DieFace value={dragState.value} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
