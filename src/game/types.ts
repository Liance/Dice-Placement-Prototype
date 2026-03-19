export const BOARD_COLS = 6;
export const BOARD_ROWS = 8;
export const MAX_TRAY_DICE = 9;
export const MANUAL_ROLL_COUNT = 3;
export const STORAGE_KEY = 'dice-placement-prototype:v1';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
export type DieSource = 'player' | 'generator' | 'snake-eyes' | 'high-roller';
export type CardKind = 'generator' | 'snakeEyes' | 'sixShooter' | 'highRoller';
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

export interface Die {
  id: string;
  value: DieValue;
  source: DieSource;
  createdAt: number;
}

export type SlotRule =
  | { kind: 'open' }
  | { kind: 'min'; value: number }
  | { kind: 'max'; value: number }
  | { kind: 'odd' }
  | { kind: 'even' }
  | { kind: 'exact'; value: DieValue }
  | { kind: 'range'; min: number; max: number };

export interface SlotDefinition {
  id: string;
  label: string;
  rule: SlotRule;
}

export interface EdgeDefinition {
  id: string;
  kind: 'input' | 'output';
  side: EdgeSide;
  index: number;
}

export interface CardDefinition {
  kind: CardKind;
  title: string;
  description: string;
  color: string;
  accent: string;
  size: {
    w: number;
    h: number;
  };
  cycleMs: number;
  requiresConnectedOutput: boolean;
  slotColumns: number;
  slotDefinitions: SlotDefinition[];
  inputEdges: EdgeDefinition[];
  outputEdges: EdgeDefinition[];
}

export interface CardInstance {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  slotDice: Array<Die | null>;
  inputBuffer: Die[];
  progressMs: number;
  heldOutput: Die[];
}

export interface ConnectionMap {
  outputToInput: Record<string, string>;
  inputToOutput: Record<string, string>;
}

export interface CardStatus {
  isActive: boolean;
  isAwaitingOutput: boolean;
  hasConnectedInput: boolean;
  hasConnectedOutput: boolean;
  progressRatio: number;
}

export interface GameState {
  version: 1;
  timeMs: number;
  nextDieId: number;
  score: number;
  discardScore: number;
  tray: Die[];
  discardPool: Die[];
  cards: CardInstance[];
}
