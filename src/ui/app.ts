import { Game } from '../core/game';
import { bit, boxOf, cageIndexOf, colOf, rowOf } from '../core/rules';
import { CELLS, Difficulty, Mode, SIZE } from '../core/types';
import { cageLabelPosition, cageOutlinePath } from './cage-outline';
import { requestPuzzle } from './puzzle-client';
import { loadSnapshot, saveSnapshot } from './storage';

interface CellView {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  /** Pencil marks for digits 1..9. */
  notes: HTMLSpanElement[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export class App {
  private game: Game | null = null;
  private noteMode = false;
  private busy = false;
  private requestId = 0;
  private ticks = 0;
  private cells: CellView[] = [];
  private cageOf: number[] = new Array<number>(CELLS).fill(-1);
  /** SVG layer with cage outlines and sums; absent for classic puzzles. */
  private cageLayer: SVGSVGElement | null = null;

  private manualChecked = false;

  private readonly ui = {
    board: byId<HTMLDivElement>('board'),
    loading: byId<HTMLDivElement>('loading'),
    timer: byId<HTMLSpanElement>('timer'),
    mistakes: byId<HTMLSpanElement>('mistakes'),
    mode: byId<HTMLSelectElement>('mode'),
    difficulty: byId<HTMLSelectElement>('difficulty'),
    newGame: byId<HTMLButtonElement>('new-game'),
    autoCheck: byId<HTMLInputElement>('auto-check'),
    undo: byId<HTMLButtonElement>('undo'),
    erase: byId<HTMLButtonElement>('erase'),
    notes: byId<HTMLButtonElement>('notes'),
    hint: byId<HTMLButtonElement>('hint'),
    check: byId<HTMLButtonElement>('check'),
    themeToggle: byId<HTMLButtonElement>('theme-toggle'),
    pad: byId<HTMLDivElement>('pad'),
    win: byId<HTMLDialogElement>('win'),
    winText: byId<HTMLParagraphElement>('win-text'),
    winNew: byId<HTMLButtonElement>('win-new'),
    winClose: byId<HTMLButtonElement>('win-close'),
  };

  start(): void {
    const savedTheme = localStorage.getItem('sudoku-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    this.buildBoard();
    this.buildPad();
    this.bindEvents();
    setInterval(() => this.tick(), 1000);

    const saved = loadSnapshot();
    if (saved) {
      const game = new Game(saved.puzzle, saved);
      this.setGame(game);
      if (game.finished) {
        this.showWin();
      }
    } else {
      void this.newGame('classic', 'medium');
    }
  }

  // ---- construction -------------------------------------------------------

  private buildBoard(): void {
    for (let i = 0; i < CELLS; i++) {
      const root = document.createElement('div');
      root.className = 'cell';
      root.dataset.index = String(i);
      root.setAttribute('role', 'gridcell');

      const value = document.createElement('span');
      value.className = 'value';

      const notesEl = document.createElement('div');
      notesEl.className = 'notes';
      const notes: HTMLSpanElement[] = [];
      for (let d = 1; d <= SIZE; d++) {
        const note = document.createElement('span');
        notesEl.appendChild(note);
        notes.push(note);
      }

      root.append(notesEl, value);
      this.ui.board.appendChild(root);
      this.cells.push({ root, value, notes });
    }
  }

  private buildPad(): void {
    for (let d = 1; d <= SIZE; d++) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'key';
      key.textContent = String(d);
      key.addEventListener('click', () => this.input(d));
      this.ui.pad.appendChild(key);
    }
  }

  private bindEvents(): void {
    this.ui.board.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!target || !this.game || this.busy) return;
      this.game.select(Number(target.dataset.index));
      this.render();
    });

    this.ui.undo.addEventListener('click', () => this.afterChange(this.game?.undo()));
    this.ui.erase.addEventListener('click', () => this.afterChange(this.game?.erase()));
    this.ui.hint.addEventListener('click', () => this.afterChange(this.game?.hint()));
    this.ui.notes.addEventListener('click', () => this.toggleNotes());
    this.ui.check.addEventListener('click', () => {
      this.manualChecked = true;
      this.render();
    });
    this.ui.autoCheck.addEventListener('change', () => {
      if (this.game) {
        this.game.autoCheckMistakes = this.ui.autoCheck.checked;
        this.persist();
      }
      this.manualChecked = false;
      this.render();
    });

    this.ui.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('sudoku-theme', next);
      } catch {}
    });

    this.ui.newGame.addEventListener('click', () => this.startNewFromSettings());

    this.ui.winNew.addEventListener('click', () => {
      this.ui.win.close();
      this.startNewFromSettings();
    });
    this.ui.winClose.addEventListener('click', () => this.ui.win.close());

    window.addEventListener('keydown', (event) => this.onKey(event));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.game || this.busy) return;
    if (event.target instanceof HTMLSelectElement) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.afterChange(this.game.undo());
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    if (/^[1-9]$/.test(key)) {
      this.input(Number(key));
    } else if (key === '0' || key === 'Backspace' || key === 'Delete') {
      this.afterChange(this.game.erase());
    } else if (key === 'n' || key === 'N') {
      this.toggleNotes();
    } else if (key === 'h' || key === 'H') {
      this.afterChange(this.game.hint());
    } else if (key.startsWith('Arrow')) {
      this.moveSelection(key);
    } else {
      return;
    }
    event.preventDefault();
  }

  // ---- game flow ----------------------------------------------------------

  private input(d: number): void {
    if (!this.game) return;
    this.afterChange(this.game.inputDigit(d, this.noteMode));
  }

  private toggleNotes(): void {
    this.noteMode = !this.noteMode;
    this.render();
  }

  private moveSelection(key: string): void {
    const g = this.game;
    if (!g) return;
    if (g.selected === null) {
      g.select(4 * SIZE + 4);
    } else {
      const r = rowOf(g.selected);
      const c = colOf(g.selected);
      const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const nr = Math.min(SIZE - 1, Math.max(0, r + dr));
      const nc = Math.min(SIZE - 1, Math.max(0, c + dc));
      g.select(nr * SIZE + nc);
    }
    this.render();
  }

  /** Called after any action on the game; `changed` is what the action returned. */
  private afterChange(changed: boolean | undefined): void {
    if (!this.game) return;
    if (changed) {
      this.manualChecked = false;
      this.persist();
      if (this.game.finished) this.showWin();
    }
    this.render();
  }

  private startNewFromSettings(): void {
    const mode = this.ui.mode.value as Mode;
    const difficulty = this.ui.difficulty.value as Difficulty;
    void this.newGame(mode, difficulty);
  }

  private async newGame(mode: Mode, difficulty: Difficulty): Promise<void> {
    const id = ++this.requestId;
    this.setBusy(true);
    let hasError = false;
    try {
      const puzzle = await requestPuzzle(mode, difficulty);
      if (id !== this.requestId) return;
      this.setGame(new Game(puzzle));
    } catch (error) {
      console.error(error);
      if (id === this.requestId) {
        hasError = true;
      }
    } finally {
      if (id === this.requestId) {
        this.setBusy(false);
        if (hasError) {
          this.ui.loading.textContent = 'Could not create a puzzle. Please try again.';
          this.ui.loading.hidden = false;
        }
      }
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.ui.board.setAttribute('aria-busy', String(busy));
    this.ui.board.classList.toggle('busy', busy);
    if (busy) {
      this.ui.loading.textContent = 'Creating puzzle…';
      this.ui.loading.hidden = false;
    } else {
      this.ui.loading.hidden = true;
    }
  }

  private setGame(game: Game): void {
    this.game = game;
    this.manualChecked = false;
    this.ui.mode.value = game.puzzle.mode;
    this.ui.difficulty.value = game.puzzle.difficulty;
    this.ui.autoCheck.checked = game.autoCheckMistakes;
    this.layoutPuzzle();
    this.persist();
    this.render();
  }

  private tick(): void {
    const g = this.game;
    if (!g || this.busy || g.finished || document.visibilityState !== 'visible') return;
    g.elapsedSeconds++;
    this.ui.timer.textContent = formatTime(g.elapsedSeconds);
    if (++this.ticks % 5 === 0) this.persist();
  }

  private persist(): void {
    if (this.game) saveSnapshot(this.game.toJSON());
  }

  private showWin(): void {
    const g = this.game;
    if (!g) return;
    this.ui.winText.textContent =
      `Time ${formatTime(g.elapsedSeconds)} · ${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}` +
      ` · ${g.hints} hint${g.hints === 1 ? '' : 's'}`;
    if (!this.ui.win.open) this.ui.win.showModal();
  }

  // ---- rendering ----------------------------------------------------------

  /** Sets box borders, and draws cage outlines and sums. Runs once per puzzle. */
  private layoutPuzzle(): void {
    const puzzle = this.game!.puzzle;
    this.cageOf = cageIndexOf(puzzle.cages);

    for (let i = 0; i < CELLS; i++) {
      const classes = this.cells[i].root.classList;
      classes.remove('edge-right', 'edge-bottom', 'has-cage-sum');
      if (colOf(i) < SIZE - 1 && boxOf(i) !== boxOf(i + 1)) classes.add('edge-right');
      if (rowOf(i) < SIZE - 1 && boxOf(i) !== boxOf(i + SIZE)) classes.add('edge-bottom');
    }

    this.cageLayer?.remove();
    this.cageLayer = null;
    if (puzzle.cages.length === 0) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cage-layer');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const cage of puzzle.cages) {
      const first = Math.min(...cage.cells);
      this.cells[first]?.root.classList.add('has-cage-sum');

      const outline = document.createElementNS(SVG_NS, 'path');
      outline.setAttribute('class', 'cage-outline');
      outline.setAttribute('d', cageOutlinePath(cage.cells));
      svg.appendChild(outline);

      const [x, y] = cageLabelPosition(cage.cells);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'cage-sum');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.textContent = String(cage.sum);
      svg.appendChild(label);
    }
    // Insert inside the board frame, above the cells.
    this.ui.board.insertAdjacentElement('afterend', svg);
    this.cageLayer = svg;
  }

  private render(): void {
    const g = this.game;
    if (!g) return;

    const sel = g.selected;
    const selValue = sel === null ? 0 : g.values[sel];
    const showWrong = g.autoCheckMistakes || this.manualChecked;

    for (let i = 0; i < CELLS; i++) {
      const view = this.cells[i];
      const v = g.values[i];
      const cls = view.root.classList;
      cls.toggle('given', g.isGiven(i));
      cls.toggle('wrong', showWrong && g.isWrong(i));
      cls.toggle('selected', i === sel);
      cls.toggle('peer', sel !== null && i !== sel && this.related(i, sel));
      cls.toggle('same', selValue !== 0 && v === selValue && i !== sel);

      view.value.textContent = v ? String(v) : '';
      for (let d = 1; d <= SIZE; d++) {
        const marked = !v && (g.notes[i] & bit(d)) !== 0;
        view.notes[d - 1].textContent = marked ? String(d) : '';
      }
    }

    this.ui.timer.textContent = formatTime(g.elapsedSeconds);
    this.ui.mistakes.textContent = String(g.mistakes);
    this.ui.undo.disabled = !g.canUndo;
    this.ui.notes.setAttribute('aria-pressed', String(this.noteMode));
    this.ui.notes.classList.toggle('active', this.noteMode);
    this.ui.hint.disabled = g.finished;
    this.ui.erase.disabled = g.finished;
    this.ui.check.disabled = g.finished;
  }

  /** Whether cell i shares a row, column, box or (killer) cage with cell sel. */
  private related(i: number, sel: number): boolean {
    if (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel)) return true;
    return this.cageOf[sel] !== -1 && this.cageOf[i] === this.cageOf[sel];
  }
}
