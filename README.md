# Sudoku & Killer Sudoku

A TypeScript sudoku game with Classic and Killer modes. It runs as a static
web app in desktop browsers and mobile browsers (portrait and landscape).

## Run

```bash
npm install
npm run dev        # development server (add --host to reach it from a phone on the LAN)
npm run build      # type-check and build to dist/
npm run preview    # serve dist/ locally
npm test           # unit tests
```

`dist/` is plain static files, so it can be hosted on any static host.

## Features

- **Classic sudoku**: every puzzle has a unique solution. Difficulty sets the
  number of clues (easy, medium, hard, expert).
- **Killer sudoku**: cages with sums and no repeated digit within a cage.
  Every puzzle is checked to have exactly one solution. Generation runs in a
  Web Worker so the UI stays responsive.
- Pencil marks (notes), undo, erase, hint, and a mistake counter.
- Wrong digits show in red. Mistakes are counted when entered; undo does not
  reduce the count.
- Timer that pauses while the tab is hidden. The current game is saved in
  `localStorage` and restored on reload.
- Touch-first layout with large number-pad targets, light and dark themes,
  and keyboard support on desktop.

## Controls

| Action      | Touch / mouse       | Keyboard               |
| ----------- | ------------------- | ---------------------- |
| Select cell | tap / click         | arrow keys             |
| Enter digit | number pad          | 1–9                    |
| Pencil mark | Notes, then digit   | N, then 1–9            |
| Erase       | Erase               | Backspace / Delete / 0 |
| Undo        | Undo                | Ctrl+Z                 |
| Hint        | Hint                | H                      |

## Layout

```
src/core/   pure logic (no DOM): rules, solver, generators, game state
src/ui/     DOM app, generation worker, storage
tests/      vitest suites for the core logic
```

The solver is a bitmask backtracking search with most-constrained-cell
selection, and it supports killer cage sums. The killer generator starts with
single-cell cages and merges neighbours only while the solution stays unique.
A node budget and a time budget keep generation bounded. A merge that cannot be
verified in time is skipped, so the puzzle stays unique.
