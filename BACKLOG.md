# Sudoku Backlog

Action items and improvements identified during codebase review, grouped by category and prioritized.

---

## 1. Bugs & Functional Defects

### ~~[BUG-01] Generation error message swallowed immediately~~
- **Priority**: High
- **Files**: [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L222-L231)
- **Description**: In `App.newGame()`, the `catch` block unhides the loading message to display `"Could not create a puzzle. Please try again."`, but the `finally` block immediately calls `setBusy(false)`, which unconditionally resets `this.ui.loading.hidden = true;`. The error message is therefore never visible to the user.
- **Proposed Solution**: Separate busy state from error state, or avoid hiding `#loading` when an error has occurred.

### ~~[BUG-02] `hint()` does not clear peer pencil notes~~
- **Priority**: High
- **Files**: [`src/core/game.ts`](file:///home/oleg/work/sudoku/src/core/game.ts#L102-L116)
- **Description**: While `Game.inputDigit()` automatically removes pencil notes for the placed digit across peer cells (`for (const j of PEERS[i]) this.notes[j] &= ~bit(d);`), `Game.hint()` only clears notes on the hinted cell itself. Outstanding pencil marks for that digit remain in the same row, column, and box.
- **Proposed Solution**: Replicate peer note clearance in `Game.hint()` after placing the hint digit.

### ~~[BUG-03] Note auto-clearing ignores non-orthogonal Killer cage peers~~
- **Priority**: High
- **Files**: [`src/core/game.ts`](file:///home/oleg/work/sudoku/src/core/game.ts#L80-L84)
- **Description**: Killer Sudoku rules forbid duplicate digits within a cage. In `Game.inputDigit()`, notes are only cleared for classic `PEERS[i]` (row, col, box). If an L-shaped or multi-cell cage spans across box boundaries, cage cells that do not share a row, column, or box retain obsolete notes.
- **Proposed Solution**: Pass cage membership information or resolve cage peers in `Game` so all cells sharing a cage with `i` have the placed digit cleared from their notes.

### ~~[BUG-04] Worker job backlog on rapid "New Game" triggers~~
- **Priority**: Medium
- **Files**: [`src/ui/puzzle-client.ts`](file:///home/oleg/work/sudoku/src/ui/puzzle-client.ts#L41-L50), [`src/ui/generator.worker.ts`](file:///home/oleg/work/sudoku/src/ui/generator.worker.ts)
- **Description**: `requestPuzzle()` sends requests to a single shared Web Worker. If a user triggers a new game while Killer generation is running, the new job queues behind the existing 1.5s generation. Even though the app discards stale results via `id !== this.requestId`, the user suffers the cumulative wait time.
- **Proposed Solution**: Terminate and restart the worker on new requests, or implement a cancellation/abort mechanism so obsolete generation jobs abort immediately.

### ~~[BUG-05] Pencil marks overlap with Killer cage sum indicators (especially digit 1)~~
- **Priority**: High
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L287-L333), [`src/ui/cage-outline.ts`](file:///home/oleg/work/sudoku/src/ui/cage-outline.ts#L73-L77), [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L86-L94)
- **Description**: In Killer Sudoku, group sum labels are positioned at the top-left of the first cell in a cage (`[col + 0.14, row + 0.12]`). Pencil marks (candidate notes) are laid out in a 3×3 grid where digit `1` occupies the exact same top-left slot (`row 1, col 1`). Furthermore, the SVG `.cage-sum` element renders on top with a knockout background stroke (`stroke: var(--cell)`), colliding with and partially obscuring note `1` (and note `2` for multi-digit sums).
- **Proposed Solution**: Shift or pad the `.notes` subgrid when a cell contains a cage sum indicator, or reposition the cage sum label to a designated corner badge outside the candidate grid.

---

## 2. UX & Game Mechanics Improvements

### ~~[UX-01] Accidental game reset on Mode / Difficulty change~~
- **Priority**: Medium
- **Files**: [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L126-L127)
- **Description**: `change` events on the `#mode` and `#difficulty` `<select>` elements immediately trigger `newGame()`. On mobile touch devices, scrolling or accidental taps destroy the current game without warning or confirmation.
- **Proposed Solution**: Only apply mode/difficulty selections when the user explicitly clicks the "New game" button, or prompt for confirmation if moves have already been made.

### ~~[UX-02] Optional / configurable instant mistake detection~~
- **Priority**: Medium
- **Files**: [`src/core/game.ts`](file:///home/oleg/work/sudoku/src/core/game.ts#L50-L52), [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L328)
- **Description**: `Game.isWrong()` checks input directly against `puzzle.solution[i]`, turning wrong cells red and incrementing mistakes instantly. In Killer Sudoku, this spoils trial deductions that may locally sum correctly.
- **Proposed Solution**: Add a setting or toggle for "Check mistakes automatically" vs. manual "Check board" validation.

### ~~[UX-03] Persist undo stack across page reloads~~
- **Priority**: Low
- **Files**: [`src/core/game.ts`](file:///home/oleg/work/sudoku/src/core/game.ts#L143-L154), [`src/ui/storage.ts`](file:///home/oleg/work/sudoku/src/ui/storage.ts#L6-L20)
- **Description**: `Game.toJSON()` serializes values and notes but omits `undoStack`. Refreshing the browser preserves board numbers but resets the undo history.
- **Proposed Solution**: Include `undoStack?: Snapshot[]` in `GameSnapshot` so players can continue undoing previous moves after a reload.

### ~~[UX-04] Handling completed game reload~~
- **Priority**: Low
- **Files**: [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L66-L72), [`src/ui/storage.ts`](file:///home/oleg/work/sudoku/src/ui/storage.ts)
- **Description**: Reloading the page after completing a puzzle reloads the frozen, finished board without opening the win dialog or prompting for a new game.
- **Proposed Solution**: Either clear snapshot from `localStorage` upon victory or detect `saved.finished` on load to present a "Start New Game" prompt.

### ~~[UX-05] User theme toggle switch~~
- **Priority**: Low
- **Files**: [`index.html`](file:///home/oleg/work/sudoku/index.html), [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L26-L71), [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts)
- **Description**: CSS supports light and dark modes via `:root[data-theme='light']` and `:root[data-theme='dark']`, but there is no UI control or persistence to manually toggle themes independently of `prefers-color-scheme`.
- **Proposed Solution**: Add a theme switcher icon/button in the topbar and persist the selection in `localStorage`.

### [UX-06] Mobile landscape layout responsiveness
- **Priority**: Low
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L98-L106)
- **Description**: On phones in landscape orientation (viewport height < 450px), the vertical flex column overflows and requires scrolling between the board and number pad.
- **Proposed Solution**: Add landscape media queries placing the board and controls side by side.

### [UX-07] Immediate tactile feedback: add `:active` state to board cells
- **Priority**: Low
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L229-L241)
- **Description**: While buttons have an active press state (`transform: translateY(1px)`), `.cell` lacks any `:active` styling. On touchscreens, there is zero immediate visual feedback when the player touches a cell until the full touch sequence completes and fires `click`.
- **Proposed Solution**: Add a subtle `:active` highlight (e.g. `background: var(--cell-selected)`) on `.cell:active` for instant tactile response.

### [UX-08] Support horizontal safe-area insets for notched devices in landscape
- **Priority**: Low
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L98-L106)
- **Description**: `.app` padding incorporates top and bottom safe-area insets (`env(safe-area-inset-top)` / `bottom`) but fixes horizontal padding at 16px. On devices with camera cutouts or Dynamic Island held in landscape, edge elements sit flush against the display cutout.
- **Proposed Solution**: Use `padding-left: calc(env(safe-area-inset-left) + 16px)` and `padding-right: calc(env(safe-area-inset-right) + 16px)`.

---

## 3. Accessibility (a11y) & Standards

### [A11Y-01] Valid ARIA grid hierarchy
- **Priority**: Medium
- **Files**: [`index.html`](file:///home/oleg/work/sudoku/index.html#L45), [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L76-L98)
- **Description**: `#board` is assigned `role="grid"`, but its direct children are 81 `role="gridcell"` elements. ARIA grid semantics require cells to be grouped in `role="row"` parent containers.
- **Proposed Solution**: Wrap every 9 cells in a row container with `role="row"`, or adjust ARIA attributes to conform to the WAI-ARIA Grid pattern.

### [A11Y-02] Roving tabindex and cell selection accessibility
- **Priority**: Medium
- **Files**: [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L323-L332)
- **Description**: Cells cannot be focused via Tab key (`tabindex` is missing), and selection changes do not reflect `aria-selected="true"`. Screen readers and assistive devices cannot navigate cells or announce the current selection.
- **Proposed Solution**: Add roving `tabindex="0"` on the selected cell (`-1` on all others), set `aria-selected`, and update focus as the player moves with arrow keys.

---

## 4. Performance & Smoothness Optimizations

### [PERF-01] Eliminate mobile tap delay on board cells with `touch-action`
- **Priority**: High
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L92-L96), [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L229-L241)
- **Description**: `touch-action: manipulation` is set on `button, select` but omitted from `.board` and `.cell`. On mobile webviews and mobile browsers (iOS Safari, Android Chrome), tapping board cells can incur up to a 300ms double-tap zoom delay before `click` fires.
- **Proposed Solution**: Add `touch-action: manipulation` (or `touch-action: none`) to `.board` and `.cell`.

### [PERF-02] Guard DOM text mutations in `render()` to eliminate 810 writes per action
- **Priority**: Medium
- **Files**: [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L333-L338)
- **Description**: On every move or selection shift, `render()` unconditionally assigns `.textContent` across all 81 cell values and 729 note spans (810 total DOM writes). In browser engine benchmarks, guarding assignments with `if (node.textContent !== next) node.textContent = next;` reduces render cost from 0.59ms to 0.05ms (11x speedup), eliminating frame drops during rapid arrow-key navigation.
- **Proposed Solution**: Guard `value.textContent` and `notes[d-1].textContent` assignments so only changed text nodes are touched.

### [PERF-03] Animated loading state during Killer generation
- **Priority**: Low
- **Files**: [`src/styles.css`](file:///home/oleg/work/sudoku/src/styles.css#L334-L347), [`src/ui/app.ts`](file:///home/oleg/work/sudoku/src/ui/app.ts#L233-L243)
- **Description**: Killer generation runs for ~1.5s in the worker. While generating, the previous board remains visible at 50% opacity with static text `"Creating puzzle…"`. Without a CSS spinner or pulse animation, the page appears frozen rather than active.
- **Proposed Solution**: Add a lightweight CSS spinner or pulsing skeleton state to `.loading`.

### [PERF-04] Precompute min/max sum bounds in `fitsCage()`
- **Priority**: Low
- **Files**: [`src/core/solver.ts`](file:///home/oleg/work/sudoku/src/core/solver.ts#L110-L126)
- **Description**: In `fitsCage()`, candidate checking runs two loops (1 to 9 and 9 down to 1) for every digit to compute the lowest and highest sum achievable with remaining digits. During 2,000 merge attempts in Killer generation, this is called tens of thousands of times.
- **Proposed Solution**: Precalculate triangular min/max sums for $k$ remaining numbers to speed up candidate pruning.

