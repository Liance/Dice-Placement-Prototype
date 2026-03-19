import { INITIAL_CARDS, getCardDefinition } from './definitions';
import type {
  CardDefinition,
  CardInstance,
  CardStatus,
  ConnectionMap,
  Die,
  DieSource,
  DieValue,
  EdgeDefinition,
  EdgeSide,
  GameState,
  SlotRule
} from './types';
import { BOARD_COLS, BOARD_ROWS, MANUAL_ROLL_COUNT, MAX_TRAY_DICE } from './types';

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

function randomDieValue(): DieValue {
  return (Math.floor(Math.random() * 6) + 1) as DieValue;
}

function createDie(
  state: GameState,
  source: DieSource,
  value: DieValue = randomDieValue()
): Die {
  return {
    id: `die-${state.nextDieId++}`,
    value,
    source,
    createdAt: state.timeMs
  };
}

function createDice(
  state: GameState,
  source: DieSource,
  count: number,
  value?: DieValue
): Die[] {
  return Array.from({ length: count }, () =>
    createDie(state, source, value ?? randomDieValue())
  );
}

export function createInitialGameState(): GameState {
  return {
    version: 1,
    timeMs: 0,
    nextDieId: 1,
    score: 0,
    discardScore: 0,
    tray: [],
    discardPool: [],
    cards: cloneState(INITIAL_CARDS)
  };
}

export function sanitizeLoadedState(candidate: unknown): GameState {
  if (!candidate || typeof candidate !== 'object') {
    return createInitialGameState();
  }

  const state = candidate as Partial<GameState>;
  if (state.version !== 1 || !Array.isArray(state.cards) || !Array.isArray(state.tray)) {
    return createInitialGameState();
  }

  try {
    const restored = cloneState(state) as GameState;
    return restored;
  } catch {
    return createInitialGameState();
  }
}

export function canPlaceDieInSlot(die: Die, rule: SlotRule): boolean {
  switch (rule.kind) {
    case 'open':
      return true;
    case 'min':
      return die.value >= rule.value;
    case 'max':
      return die.value <= rule.value;
    case 'odd':
      return die.value % 2 === 1;
    case 'even':
      return die.value % 2 === 0;
    case 'exact':
      return die.value === rule.value;
    case 'range':
      return die.value >= rule.min && die.value <= rule.max;
    default:
      return false;
  }
}

function getEdgeKey(cardId: string, edgeId: string): string {
  return `${cardId}:${edgeId}`;
}

function getOppositeSide(side: EdgeSide): EdgeSide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function getEdgeSegment(card: CardInstance, edge: EdgeDefinition) {
  const definition = getCardDefinition(card.kind);

  if (edge.side === 'top' || edge.side === 'bottom') {
    return {
      orientation: 'horizontal' as const,
      fixed: edge.side === 'top' ? card.y : card.y + definition.size.h,
      start: card.x + edge.index,
      side: edge.side
    };
  }

  return {
    orientation: 'vertical' as const,
    fixed: edge.side === 'left' ? card.x : card.x + definition.size.w,
    start: card.y + edge.index,
    side: edge.side
  };
}

function getSegmentKey(card: CardInstance, edge: EdgeDefinition): string {
  const segment = getEdgeSegment(card, edge);
  return `${segment.orientation}:${segment.fixed}:${segment.start}`;
}

export function recomputeConnections(cards: CardInstance[]): ConnectionMap {
  const inputsBySegment = new Map<
    string,
    Array<{ cardId: string; edgeId: string; side: EdgeSide }>
  >();
  const outputsBySegment = new Map<
    string,
    Array<{ cardId: string; edgeId: string; side: EdgeSide }>
  >();

  for (const card of cards) {
    const definition = getCardDefinition(card.kind);

    for (const edge of definition.inputEdges) {
      const key = getSegmentKey(card, edge);
      const next = inputsBySegment.get(key) ?? [];
      next.push({ cardId: card.id, edgeId: edge.id, side: edge.side });
      inputsBySegment.set(key, next);
    }

    for (const edge of definition.outputEdges) {
      const key = getSegmentKey(card, edge);
      const next = outputsBySegment.get(key) ?? [];
      next.push({ cardId: card.id, edgeId: edge.id, side: edge.side });
      outputsBySegment.set(key, next);
    }
  }

  const outputToInput: Record<string, string> = {};
  const inputToOutput: Record<string, string> = {};

  for (const [segmentKey, outputs] of outputsBySegment) {
    const inputs = inputsBySegment.get(segmentKey);
    if (!inputs || outputs.length === 0 || inputs.length === 0) {
      continue;
    }

    for (const output of outputs) {
      const compatibleInput = inputs.find(
        (input) => input.side === getOppositeSide(output.side)
      );

      if (!compatibleInput) {
        continue;
      }

      const outputKey = getEdgeKey(output.cardId, output.edgeId);
      const inputKey = getEdgeKey(compatibleInput.cardId, compatibleInput.edgeId);
      outputToInput[outputKey] = inputKey;
      inputToOutput[inputKey] = outputKey;
    }
  }

  return { outputToInput, inputToOutput };
}

function rectanglesOverlap(a: CardInstance, b: CardInstance): boolean {
  const aDef = getCardDefinition(a.kind);
  const bDef = getCardDefinition(b.kind);

  return !(
    a.x + aDef.size.w <= b.x ||
    b.x + bDef.size.w <= a.x ||
    a.y + aDef.size.h <= b.y ||
    b.y + bDef.size.h <= a.y
  );
}

function isWithinBounds(card: CardInstance): boolean {
  const definition = getCardDefinition(card.kind);
  return (
    card.x >= 0 &&
    card.y >= 0 &&
    card.x + definition.size.w <= BOARD_COLS &&
    card.y + definition.size.h <= BOARD_ROWS
  );
}

function getConnectedOutputTargetId(
  card: CardInstance,
  connections: ConnectionMap
): string | null {
  const definition = getCardDefinition(card.kind);

  for (const output of definition.outputEdges) {
    const outputKey = getEdgeKey(card.id, output.id);
    const mapped = connections.outputToInput[outputKey];
    if (!mapped) {
      continue;
    }

    return mapped.split(':')[0] ?? null;
  }

  return null;
}

function getConnectedInputSourceId(
  card: CardInstance,
  connections: ConnectionMap
): string | null {
  const definition = getCardDefinition(card.kind);

  for (const input of definition.inputEdges) {
    const inputKey = getEdgeKey(card.id, input.id);
    const mapped = connections.inputToOutput[inputKey];
    if (!mapped) {
      continue;
    }

    return mapped.split(':')[0] ?? null;
  }

  return null;
}

function getCardById(state: GameState, cardId: string): CardInstance | undefined {
  return state.cards.find((card) => card.id === cardId);
}

function hasSlotsFilled(card: CardInstance, definition: CardDefinition): boolean {
  return (
    definition.slotDefinitions.length === 0 || card.slotDice.every((die) => die !== null)
  );
}

function sendToDiscard(state: GameState, die: Die): void {
  state.discardScore += 1;
  state.discardPool.push(die);
}

function fillFromInputBuffer(state: GameState, card: CardInstance): void {
  const definition = getCardDefinition(card.kind);

  while (
    card.inputBuffer.length > 0 &&
    card.slotDice.some((slotDie) => slotDie === null)
  ) {
    const die = card.inputBuffer.shift();
    if (!die) {
      break;
    }

    const slotIndex = definition.slotDefinitions.findIndex(
      (slotDefinition, index) =>
        card.slotDice[index] === null && canPlaceDieInSlot(die, slotDefinition.rule)
    );

    if (slotIndex >= 0) {
      card.slotDice[slotIndex] = die;
      continue;
    }

    sendToDiscard(state, die);
  }
}

function enqueueDiceToCard(state: GameState, cardId: string, dice: Die[]): void {
  const card = getCardById(state, cardId);
  if (!card || dice.length === 0) {
    return;
  }

  card.inputBuffer.push(...dice);
  fillFromInputBuffer(state, card);
}

function flushHeldOutputs(state: GameState): void {
  let flushed = true;

  while (flushed) {
    flushed = false;
    const connections = recomputeConnections(state.cards);

    for (const card of state.cards) {
      if (card.heldOutput.length === 0) {
        continue;
      }

      const targetId = getConnectedOutputTargetId(card, connections);
      if (!targetId) {
        continue;
      }

      const payload = card.heldOutput.splice(0, card.heldOutput.length);
      enqueueDiceToCard(state, targetId, payload);
      card.progressMs = 0;
      fillFromInputBuffer(state, card);
      flushed = true;
    }
  }
}

function resolveCompletion(state: GameState, card: CardInstance): Die[] {
  switch (card.kind) {
    case 'generator':
      return createDice(state, 'generator', 3);
    case 'snakeEyes': {
      const total = card.slotDice.reduce(
        (sum, die) => sum + (die ? die.value : 0),
        0
      );
      return createDice(state, 'snake-eyes', total, 1);
    }
    case 'highRoller': {
      const sourceValue = card.slotDice.find(Boolean)?.value;
      if (!sourceValue) {
        return [];
      }
      return createDice(state, 'high-roller', 2, sourceValue);
    }
    case 'sixShooter':
      return [];
  }
}

function resolveScore(state: GameState, card: CardInstance): void {
  if (card.kind === 'sixShooter') {
    state.score += 6;
  }
}

function consumeSlots(card: CardInstance): void {
  card.slotDice = card.slotDice.map(() => null);
}

function completeCardCycle(
  state: GameState,
  card: CardInstance,
  connections: ConnectionMap
): void {
  const definition = getCardDefinition(card.kind);
  const producedDice = resolveCompletion(state, card);
  resolveScore(state, card);

  if (definition.slotDefinitions.length > 0) {
    consumeSlots(card);
  }

  if (producedDice.length > 0 && definition.outputEdges.length > 0) {
    const targetId = getConnectedOutputTargetId(card, connections);
    if (targetId) {
      enqueueDiceToCard(state, targetId, producedDice);
      card.progressMs = 0;
      fillFromInputBuffer(state, card);
      return;
    }

    card.heldOutput = producedDice;
    card.progressMs = definition.cycleMs;
    fillFromInputBuffer(state, card);
    return;
  }

  card.progressMs = 0;
  fillFromInputBuffer(state, card);
}

function getCardStatusFromConnections(
  card: CardInstance,
  connections: ConnectionMap
): CardStatus {
  const definition = getCardDefinition(card.kind);
  const isAwaitingOutput = card.heldOutput.length > 0;
  const hasConnectedOutput = getConnectedOutputTargetId(card, connections) !== null;
  const hasConnectedInput = getConnectedInputSourceId(card, connections) !== null;
  const slotsFilled = hasSlotsFilled(card, definition);
  const isReadyBySlots =
    definition.slotDefinitions.length === 0 ? true : slotsFilled;

  const isActive =
    isAwaitingOutput ||
    (isReadyBySlots &&
      (!definition.requiresConnectedOutput || hasConnectedOutput));

  return {
    isActive,
    isAwaitingOutput,
    hasConnectedInput,
    hasConnectedOutput,
    isReady: slotsFilled,
    filledSlots: card.slotDice.filter(Boolean).length,
    totalSlots: definition.slotDefinitions.length,
    progressRatio: isAwaitingOutput
      ? 1
      : Math.min(1, card.progressMs / definition.cycleMs)
  };
}

export function getCardStatus(state: GameState, card: CardInstance): CardStatus {
  const connections = recomputeConnections(state.cards);
  return getCardStatusFromConnections(card, connections);
}

export function getCompatibleTargets(
  state: GameState,
  die: Die
): Array<{ cardId: string; slotId: string }> {
  const matches: Array<{ cardId: string; slotId: string }> = [];

  for (const card of state.cards) {
    const definition = getCardDefinition(card.kind);

    definition.slotDefinitions.forEach((slot, index) => {
      if (card.slotDice[index] !== null) {
        return;
      }

      if (!canPlaceDieInSlot(die, slot.rule)) {
        return;
      }

      matches.push({ cardId: card.id, slotId: slot.id });
    });
  }

  return matches;
}

function countRemainingOpenSlotsAfterPlacement(
  card: CardInstance,
  slotIndex: number
): number {
  return card.slotDice.filter((die, index) => die === null && index !== slotIndex).length;
}

function getCompletionPreview(card: CardInstance, die: Die): string {
  switch (card.kind) {
    case 'snakeEyes': {
      const total =
        card.slotDice.reduce((sum, slotDie) => sum + (slotDie?.value ?? 0), 0) + die.value;
      return `Ready: ${total}x1`;
    }
    case 'highRoller':
      return `Ready: 2x${die.value}`;
    case 'sixShooter':
      return 'Ready: +6 score';
    case 'generator':
      return 'Auto';
  }
}

export function getCardDropPreview(
  state: GameState,
  cardId: string,
  slotId: string,
  die: Die
): { accepted: boolean; summary: string; detail: string } {
  const card = getCardById(state, cardId);
  if (!card) {
    return {
      accepted: false,
      summary: 'No target',
      detail: 'Move onto a module slot.'
    };
  }

  const definition = getCardDefinition(card.kind);
  const slotIndex = definition.slotDefinitions.findIndex((slot) => slot.id === slotId);
  if (slotIndex < 0) {
    return {
      accepted: false,
      summary: 'No slot',
      detail: 'Choose a visible slot.'
    };
  }

  if (card.slotDice[slotIndex] !== null) {
    return {
      accepted: false,
      summary: 'Occupied',
      detail: 'That slot is already filled.'
    };
  }

  const slot = definition.slotDefinitions[slotIndex];
  if (!canPlaceDieInSlot(die, slot.rule)) {
    return {
      accepted: false,
      summary: 'Blocked',
      detail: `Needs ${getSlotRuleText(slot.rule)}`
    };
  }

  const remainingSlots = countRemainingOpenSlotsAfterPlacement(card, slotIndex);
  if (remainingSlots === 0) {
    return {
      accepted: true,
      summary: getCompletionPreview(card, die),
      detail: `Cycle ${Math.round(definition.cycleMs / 1000)}s`
    };
  }

  return {
    accepted: true,
    summary: `Place ${die.value}`,
    detail: `${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} left`
  };
}

export function rollTrayDice(
  currentState: GameState,
  count: number = MANUAL_ROLL_COUNT
): GameState {
  if (currentState.tray.length >= MAX_TRAY_DICE) {
    return currentState;
  }

  const state = cloneState(currentState);
  const toCreate = Math.max(0, Math.min(count, MAX_TRAY_DICE - state.tray.length));

  for (let index = 0; index < toCreate; index += 1) {
    state.tray.push(createDie(state, 'player'));
  }

  return state;
}

export function attemptManualDiePlacement(
  currentState: GameState,
  dieId: string,
  cardId: string,
  slotId: string
): GameState {
  const state = cloneState(currentState);
  const trayIndex = state.tray.findIndex((die) => die.id === dieId);
  const card = getCardById(state, cardId);

  if (trayIndex < 0 || !card) {
    return currentState;
  }

  const definition = getCardDefinition(card.kind);
  const slotIndex = definition.slotDefinitions.findIndex((slot) => slot.id === slotId);

  if (slotIndex < 0 || card.slotDice[slotIndex] !== null) {
    return currentState;
  }

  const die = state.tray[trayIndex];
  const slot = definition.slotDefinitions[slotIndex];
  if (!canPlaceDieInSlot(die, slot.rule)) {
    return currentState;
  }

  state.tray.splice(trayIndex, 1);
  card.slotDice[slotIndex] = die;
  return state;
}

export function attemptMoveCard(
  currentState: GameState,
  cardId: string,
  x: number,
  y: number
): GameState {
  const state = cloneState(currentState);
  const card = getCardById(state, cardId);
  if (!card) {
    return currentState;
  }

  card.x = x;
  card.y = y;

  if (!isWithinBounds(card)) {
    return currentState;
  }

  const hasOverlap = state.cards.some(
    (other) => other.id !== card.id && rectanglesOverlap(card, other)
  );
  if (hasOverlap) {
    return currentState;
  }

  flushHeldOutputs(state);
  return state;
}

export function tickGame(currentState: GameState, deltaMs: number): GameState {
  if (deltaMs <= 0) {
    return currentState;
  }

  const state = cloneState(currentState);
  state.timeMs += deltaMs;
  flushHeldOutputs(state);
  const connections = recomputeConnections(state.cards);

  for (const card of state.cards) {
    const definition = getCardDefinition(card.kind);
    const status = getCardStatusFromConnections(card, connections);

    if (!status.isActive || status.isAwaitingOutput) {
      continue;
    }

    card.progressMs = Math.min(definition.cycleMs, card.progressMs + deltaMs);

    if (card.progressMs >= definition.cycleMs) {
      completeCardCycle(state, card, connections);
    }
  }

  return state;
}

export function getSlotRuleText(rule: SlotRule): string {
  switch (rule.kind) {
    case 'open':
      return 'Any';
    case 'min':
      return `>=${rule.value}`;
    case 'max':
      return `<=${rule.value}`;
    case 'odd':
      return 'Odd';
    case 'even':
      return 'Even';
    case 'exact':
      return `${rule.value} only`;
    case 'range':
      return `${rule.min}-${rule.max}`;
  }
}
