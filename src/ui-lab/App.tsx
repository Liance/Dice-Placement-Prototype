import { useEffect, useState } from 'react';
import { LAB_SCENARIOS, LAB_STORAGE_KEY } from './mockData';
import type { LabModule, LabScenario, LabSlot } from './types';
import './styles.css';

type LabState = {
  scenarioId: string;
  tray: number[];
  modules: LabModule[];
  selectedDieIndex: number | null;
  feedback: string | null;
};

function cloneScenario(scenario: LabScenario): LabState {
  return {
    scenarioId: scenario.id,
    tray: [...scenario.tray],
    modules: structuredClone(scenario.modules),
    selectedDieIndex: null,
    feedback: null
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

function slotStateClass(slot: LabSlot, selectedDie: number | null): string {
  if (slot.die !== null) {
    return 'lab-slot--filled';
  }

  if (selectedDie === null) {
    return '';
  }

  return canPlaceDie(selectedDie, slot) ? 'lab-slot--valid' : 'lab-slot--blocked';
}

function DieFace({ value }: { value: number }) {
  return (
    <div className="lab-die">
      <span className="lab-die__value">{value}</span>
    </div>
  );
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
        selectedDieIndex:
          typeof parsed.selectedDieIndex === 'number' ? parsed.selectedDieIndex : null,
        feedback: null
      };
    } catch {
      return cloneScenario(LAB_SCENARIOS[0]);
    }
  });

  const currentScenario = getScenario(state.scenarioId);
  const selectedDie =
    state.selectedDieIndex !== null ? state.tray[state.selectedDieIndex] ?? null : null;

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

  const resetScenario = (scenarioId: string) => {
    setState(cloneScenario(getScenario(scenarioId)));
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
        next.feedback = 'Returned die to hand';
        return next;
      }

      if (next.selectedDieIndex === null) {
        next.feedback = 'Select a die first';
        return next;
      }

      const value = next.tray[next.selectedDieIndex];
      if (value === undefined) {
        next.selectedDieIndex = null;
        return next;
      }

      if (!canPlaceDie(value, slot)) {
        next.feedback = `Blocked: ${slot.requirement}`;
        return next;
      }

      slot.die = value;
      next.tray.splice(next.selectedDieIndex, 1);
      next.selectedDieIndex = null;
      next.feedback = `Placed ${value} into ${module.title}`;
      return next;
    });
  };

  return (
    <main className="lab-shell">
      <header className="lab-topbar">
        <div>
          <span className="lab-badge">LAB</span>
          <h1>Dice Placement UI Lab</h1>
          <p className="lab-topbar__text">
            Isolated mockup space. Tap a die, then tap a slot. Nothing here touches the
            live game engine.
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
          {state.modules.map((module) => (
            <article key={module.id} className={`lab-module lab-module--${module.state}`}>
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
                  {module.slots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={`lab-slot ${slotStateClass(slot, selectedDie)}`}
                      onClick={() => handleSlotTap(module.id, slot.id)}
                    >
                      <span className="lab-slot__requirement">{slot.requirement}</span>
                      <div className="lab-slot__body">
                        {slot.die !== null ? <DieFace value={slot.die} /> : <span>Drop</span>}
                      </div>
                    </button>
                  ))}
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
          ))}
        </div>
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

          <p className="lab-feedback">{state.feedback ?? 'Tap through states and test quickly.'}</p>
        </div>

        <div className="lab-tray">
          <div className="lab-tray__header">
            <div>
              <p className="lab-eyebrow">Hand</p>
              <h2>Selectable dice</h2>
            </div>
            <span className="lab-tray__count">{state.tray.length} dice</span>
          </div>
          <div className="lab-tray__grid">
            {state.tray.map((value, index) => (
              <button
                key={`${value}-${index}`}
                type="button"
                className={`lab-tray__die ${
                  index === state.selectedDieIndex ? 'lab-tray__die--active' : ''
                }`}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    selectedDieIndex: current.selectedDieIndex === index ? null : index
                  }))
                }
              >
                <DieFace value={value} />
              </button>
            ))}
            {state.tray.length === 0 ? (
              <div className="lab-tray__empty">Scenario hand is empty.</div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
