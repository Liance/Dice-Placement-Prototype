# Dice Placement Idle RPG Prototype Plan

## Summary
Build the prototype as a `React + Vite` PWA with a touch-first UI, grid-snapped card placement, manual die drag/drop, and auto-connections when card edges become adjacent. Use a lightweight 2D dice presentation for v1, but isolate dice rendering and rolling behind a renderer-style boundary so a later upgrade to WebGL or pseudo-physical simulation does not require rewriting game logic.

This first prototype includes `4` cards: `Generator`, `Snake Eyes`, `Six Shooter`, and `High Roller`. The board is a finite mobile-friendly grid, cards cannot overlap, dice can be rolled into a tray, manually placed into valid slots, and auto-routed through connected card networks via input buffers.

## Implementation Changes
### App architecture
- Use `React + TypeScript + Vite + vite-plugin-pwa`.
- Keep game rules in a pure state layer separate from React rendering.
- Use a single game tick loop for card progress and queued outputs.
- Store prototype state locally only: no backend, no auth, no multiplayer.
- Persist board state, score, discard count, tray dice, and card state in `localStorage`.

### Core domain model
- Define `Die = { id, value, source, createdAt }`.
- Define `SlotRule` as a discriminated union:
  - `open`
  - `min`
  - `max`
  - `odd`
  - `even`
  - `exact`
  - `range`
- Define `CardDefinition` with immutable metadata:
  - `kind`, `title`, `description`, colors
  - `size`
  - `slotDefinitions`
  - `inputEdges`
  - `outputEdges`
  - `cycleMs`
  - `requiresConnectedOutput`
- Define `CardInstance` with mutable runtime state:
  - grid position
  - placed dice by slot
  - input buffer queue
  - progress state
  - held output queue
- Define `GameState` with:
  - board dimensions
  - card instances
  - tray dice
  - discard pool list
  - score
  - discard score

### Prototype card definitions
- `Generator`
  - size `1x1`
  - no inputs, top output
  - no placement slots
  - active only when its output edge is connected
  - cycle `10s`
  - on completion outputs `3` random dice
- `Snake Eyes`
  - size `3x1`
  - bottom-left input, top-right output
  - `3` placement slots
  - active when all slots are filled
  - cycle `10s`
  - on completion consumes slotted dice and outputs `N` dice showing `1`, where `N = sum of consumed die values`
- `Six Shooter`
  - size `2x3`
  - one bottom input, no outputs
  - `6` slots, all `exact 1`
  - active when all slots are filled
  - cycle `10s`
  - on completion consumes slotted dice and increments `score` by `6`
- `High Roller`
  - size `1x2`
  - no inputs, one top output
  - one slot with rule `min 5`
  - active when its slot is filled and its output edge is connected
  - cycle `10s`
  - on completion consumes the die and outputs `2` dice with the same consumed value

### Board, placement, and routing behavior
- Use a fixed portrait grid.
- Cards snap to grid and cannot overlap.
- Auto-connect when an output edge is directly adjacent to an input edge on neighboring grid cells and orientations match.
- Recompute all connections whenever a card moves.
- If a card completes its cycle but has no connected output target, keep its progress visually full and store the produced dice in a held output queue.
- As soon as an output becomes connected, flush held dice into the connected target’s input buffer.
- Use one-to-one connections by adjacency in v1.

### Dice tray, placement slots, and buffer processing
- Roll button adds `3` random dice to tray unless tray already has `9`; disable at `9`.
- Player drags tray dice onto compatible card slots manually.
- Show each card’s input buffer as a compact row of die values plus queue count.
- Buffer processing is automatic:
  - whenever a die enters a card buffer, or when a slot becomes empty after consumption, inspect the front die
  - place it into the first empty compatible slot
  - if no empty compatible slot exists, discard it immediately
- Discard means:
  - increment `discard score`
  - append die record to `discard pool`
  - remove die from active play

### Dice rendering and animation
- Use 2D rendered d6 components with face pips and short roll animations.
- Keep dice values authoritative in state; animation never determines roll outcomes.
- Preserve a future upgrade path for `Three.js` or `React Three Fiber + physics` by keeping dice logic independent from the rendering implementation.

### Mobile UX and PWA behavior
- Portrait-first layout:
  - board in main viewport
  - score, discard, and tray status at top
  - dice tray and roll button docked at bottom
- Use touch and pointer events; avoid desktop-only drag APIs.
- Inactive cards render slightly dimmed; active cards render full color.
- Progress bar visible on all cycling cards.
- Installable PWA with manifest and service worker caching shell assets.

## Public APIs / Types
- `canPlaceDieInSlot(die, slotRule): boolean`
- `getCardStatus(state, card): CardStatus`
- `recomputeConnections(cards): ConnectionMap`
- `tickGame(state, deltaMs): GameState`
- `attemptManualDiePlacement(state, dieId, cardId, slotId): GameState`
- `attemptMoveCard(state, cardId, gridPos): GameState`

## Test Cases and Scenarios
- Slot validation for all rule types: `open`, `min`, `max`, `odd`, `even`, `exact`.
- Tray roll behavior:
  - adds `3` dice
  - disables at `9`
  - does not exceed cap
- Card activation:
  - inactive when required slots are empty
  - active when full
  - passive cards require connected output where specified
- Progress behavior:
  - increments only while active
  - completes at expected time
  - holds full when output is blocked
- Connection behavior:
  - adjacency creates link
  - moving card away breaks link
  - reconnecting flushes held outputs
- Buffer behavior:
  - first compatible empty slot is used
  - incompatible front die is discarded
  - discard score and discard pool both update
- Card effects:
  - `Generator` outputs `3` random dice
  - `Snake Eyes` outputs sum-of-values count of `1`s
  - `Six Shooter` scores when all `1` slots are filled
  - `High Roller` duplicates a qualifying die into two outputs of the same value
- Board movement:
  - cards snap to grid
  - overlaps are rejected
  - edges and connections recompute after move
- Persistence:
  - reload restores board, tray, card progress-relevant state, score, and discard state

## Assumptions
- The prototype includes all `4` named cards.
- `Snake Eyes` uses mixed slot rules so the prototype visibly exercises multiple slot validators.
- `High Roller` uses a `>=5` slot.
- Output routing is one-to-one by adjacency in v1; no splitters or multiple simultaneous consumers.
- Idle progression runs only while the app is open; no background catch-up is included in the first prototype.
- Dice rolling is state-driven and visually animated in 2D now, with renderer abstraction preserved for future heavier simulation.
