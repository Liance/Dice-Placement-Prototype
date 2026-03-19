import type { LabScenario } from './types';

export const LAB_STORAGE_KEY = 'dice-placement-ui-lab:v1';

export const LAB_SCENARIOS: LabScenario[] = [
  {
    id: 'combat-board',
    name: 'Combat board',
    description: 'Balanced baseline for board layout, card readability, and tray density.',
    enemy: {
      name: 'Clockwork Host',
      hp: 42,
      hpMax: 42,
      intent: 'Strike 6',
      note: 'Pressure-heavy target for top-HUD experiments.'
    },
    player: {
      hp: 28,
      hpMax: 28,
      turn: 4
    },
    tray: [6, 5, 3, 2, 1],
    modules: [
      {
        id: 'snake-eyes',
        title: 'Snake Eyes',
        ruleText: 'Fill 3 slots',
        effectText: 'Output the total as 1s',
        state: 'active',
        progress: 0.42,
        queue: [1, 1],
        slots: [
          { id: 'open', label: 'Open', kind: 'open', requirement: 'Any', die: 3 },
          { id: 'odd', label: 'Odd', kind: 'odd', requirement: 'Odd', die: null },
          { id: 'max', label: '<=4', kind: 'max', requirement: '<=4', maxValue: 4, die: null }
        ]
      },
      {
        id: 'high-roller',
        title: 'High Roller',
        ruleText: 'Place a 5 or 6',
        effectText: 'Clone it twice',
        state: 'blocked',
        progress: 0,
        queue: [],
        slots: [
          { id: 'high', label: '>=5', kind: 'min', requirement: '>=5', minValue: 5, die: null }
        ]
      },
      {
        id: 'six-shooter',
        title: 'Six Shooter',
        ruleText: 'Needs six 1s',
        effectText: 'Score +6',
        state: 'queued',
        progress: 1,
        queue: [1, 1, 1],
        slots: [
          { id: 'a', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: 1 },
          { id: 'b', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: 1 },
          { id: 'c', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: 1 },
          { id: 'd', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: null },
          { id: 'e', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: null },
          { id: 'f', label: '1', kind: 'exact', requirement: '1 only', exactValue: 1, die: null }
        ]
      }
    ]
  },
  {
    id: 'tray-pressure',
    name: 'Tray pressure',
    description: 'Stress test the hand area with a nearly full tray and clearer selection states.',
    enemy: {
      name: 'Wire Matron',
      hp: 36,
      hpMax: 48,
      intent: 'Shock 2',
      note: 'Useful for evaluating tray emphasis versus board emphasis.'
    },
    player: {
      hp: 24,
      hpMax: 28,
      turn: 6
    },
    tray: [6, 6, 5, 4, 4, 3, 2, 1],
    modules: [
      {
        id: 'generator',
        title: 'Generator',
        ruleText: 'Linked output only',
        effectText: 'Gain 3 random dice',
        state: 'active',
        progress: 0.76,
        queue: [],
        slots: []
      },
      {
        id: 'odd-gate',
        title: 'Odd Gate',
        ruleText: 'Odd values only',
        effectText: 'Converts to shields',
        state: 'blocked',
        progress: 0,
        queue: [5],
        slots: [
          { id: 'odd-a', label: 'Odd', kind: 'odd', requirement: 'Odd', die: null },
          { id: 'odd-b', label: 'Odd', kind: 'odd', requirement: 'Odd', die: null }
        ]
      },
      {
        id: 'finisher',
        title: 'Finisher',
        ruleText: 'Needs exact 6',
        effectText: 'Deals 8 damage',
        state: 'ready',
        progress: 0.1,
        queue: [],
        slots: [
          { id: 'six', label: '6', kind: 'exact', requirement: '6 only', exactValue: 6, die: 6 }
        ]
      }
    ]
  },
  {
    id: 'feedback-pass',
    name: 'Feedback pass',
    description: 'Small set tuned to preview acceptance, blocked drops, and quick local response.',
    enemy: {
      name: 'Static Knight',
      hp: 30,
      hpMax: 30,
      intent: 'Guard 4',
      note: 'Useful for validating small motion and confirmation cues.'
    },
    player: {
      hp: 20,
      hpMax: 24,
      turn: 2
    },
    tray: [5, 2, 1],
    modules: [
      {
        id: 'high-roller',
        title: 'High Roller',
        ruleText: 'Place a 5 or 6',
        effectText: 'Clone it twice',
        state: 'blocked',
        progress: 0,
        queue: [],
        slots: [
          { id: 'high', label: '>=5', kind: 'min', requirement: '>=5', minValue: 5, die: null }
        ]
      },
      {
        id: 'breaker',
        title: 'Breaker',
        ruleText: 'Needs even values',
        effectText: 'Stuns for 1 turn',
        state: 'active',
        progress: 0.2,
        queue: [],
        slots: [
          { id: 'even-a', label: 'Even', kind: 'even', requirement: 'Even', die: null },
          { id: 'even-b', label: 'Even', kind: 'even', requirement: 'Even', die: null }
        ]
      }
    ]
  }
];
