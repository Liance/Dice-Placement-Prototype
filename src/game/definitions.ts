import type { CardDefinition, CardInstance, CardKind } from './types';

const cycleMs = 10_000;

export const CARD_DEFINITIONS: Record<CardKind, CardDefinition> = {
  generator: {
    kind: 'generator',
    title: 'Generator',
    description: 'Passively produces 3 random dice when connected.',
    color: '#f3a73c',
    accent: '#ffe28a',
    size: { w: 1, h: 1 },
    cycleMs,
    requiresConnectedOutput: true,
    slotColumns: 1,
    slotDefinitions: [],
    inputEdges: [],
    outputEdges: [{ id: 'out-top', kind: 'output', side: 'top', index: 0 }]
  },
  snakeEyes: {
    kind: 'snakeEyes',
    title: 'Snake Eyes',
    description: 'Consumes 3 dice and outputs that total number of 1s.',
    color: '#39b4a8',
    accent: '#8af4dc',
    size: { w: 3, h: 1 },
    cycleMs,
    requiresConnectedOutput: false,
    slotColumns: 3,
    slotDefinitions: [
      { id: 'open', label: 'Open', rule: { kind: 'open' } },
      { id: 'odd', label: 'Odd', rule: { kind: 'odd' } },
      { id: 'max4', label: '<=4', rule: { kind: 'max', value: 4 } }
    ],
    inputEdges: [{ id: 'in-bottom-left', kind: 'input', side: 'bottom', index: 0 }],
    outputEdges: [{ id: 'out-top-right', kind: 'output', side: 'top', index: 2 }]
  },
  sixShooter: {
    kind: 'sixShooter',
    title: 'Six Shooter',
    description: 'Needs six 1s and cashes them in for score.',
    color: '#d65563',
    accent: '#ffc4ca',
    size: { w: 2, h: 3 },
    cycleMs,
    requiresConnectedOutput: false,
    slotColumns: 2,
    slotDefinitions: Array.from({ length: 6 }, (_, index) => ({
      id: `one-${index + 1}`,
      label: '1 only',
      rule: { kind: 'exact', value: 1 }
    })),
    inputEdges: [{ id: 'in-bottom', kind: 'input', side: 'bottom', index: 0 }],
    outputEdges: []
  },
  highRoller: {
    kind: 'highRoller',
    title: 'High Roller',
    description: 'Duplicates a 5 or 6 into two matching dice.',
    color: '#5a7df0',
    accent: '#cad5ff',
    size: { w: 1, h: 2 },
    cycleMs,
    requiresConnectedOutput: true,
    slotColumns: 1,
    slotDefinitions: [{ id: 'high', label: '>=5', rule: { kind: 'min', value: 5 } }],
    inputEdges: [],
    outputEdges: [{ id: 'out-top', kind: 'output', side: 'top', index: 0 }]
  }
};

export const INITIAL_CARDS: CardInstance[] = [
  {
    id: 'card-generator',
    kind: 'generator',
    x: 0,
    y: 6,
    slotDice: [],
    inputBuffer: [],
    progressMs: 0,
    heldOutput: []
  },
  {
    id: 'card-snake-eyes',
    kind: 'snakeEyes',
    x: 0,
    y: 5,
    slotDice: [null, null, null],
    inputBuffer: [],
    progressMs: 0,
    heldOutput: []
  },
  {
    id: 'card-six-shooter',
    kind: 'sixShooter',
    x: 2,
    y: 2,
    slotDice: [null, null, null, null, null, null],
    inputBuffer: [],
    progressMs: 0,
    heldOutput: []
  },
  {
    id: 'card-high-roller',
    kind: 'highRoller',
    x: 4,
    y: 5,
    slotDice: [null],
    inputBuffer: [],
    progressMs: 0,
    heldOutput: []
  }
];

export function getCardDefinition(kind: CardKind): CardDefinition {
  return CARD_DEFINITIONS[kind];
}
