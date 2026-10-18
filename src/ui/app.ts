import { Game } from '../core/game';
import { bit, boxOf, cageIndexOf, colOf, rowOf } from '../core/rules';
import { CELLS, Difficulty, Mode, SIZE } from '../core/types';
import { cageLabelPosition, cageOutlinePath, round } from './cage-outline';
import { requestPuzzle } from './puzzle-client';
import { loadSnapshot, saveSnapshot } from './storage';

interface CellView {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  /** Pencil marks for digits 1..9. */
  notes: HTMLSpanElement[];
  lastValue: number;
  lastNotes: number;
  lastFlags: number;
  lastTabIndex: number;
  lastSelected: boolean;
  lastHighlightNote: number;
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
  private persistHandle: number | null = null;
  private persistIdle = false;
  private cells: CellView[] = [];
  private cageOf: number[] = new Array<number>(CELLS).fill(-1);
  /** SVG layer with grid lines; present for all puzzles. */
  private gridLayer: SVGSVGElement | null = null;
  /** SVG layer with cage outlines and sums; absent for classic puzzles. */
  private cageLayer: SVGSVGElement | null = null;

  private readonly padKeys: HTMLButtonElement[] = [];

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
    for (let r = 0; r < SIZE; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');

      for (let c = 0; c < SIZE; c++) {
        const i = r * SIZE + c;
        const root = document.createElement('div');
        root.className = 'cell';
        root.dataset.index = String(i);
        root.setAttribute('role', 'gridcell');
        const tabIndex = i === 0 ? 0 : -1;
        root.tabIndex = tabIndex;
        root.setAttribute('aria-selected', 'false');
        root.addEventListener('focus', () => {
          if (this.game && this.game.selected !== i) {
            this.game.select(i);
            this.render();
          }
        });

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
        row.appendChild(root);
        this.cells.push({
          root,
          value,
          notes,
          lastValue: 0,
          lastNotes: 0,
          lastFlags: 0,
          lastTabIndex: tabIndex,
          lastSelected: false,
          lastHighlightNote: 0,
        });
      }
      this.ui.board.appendChild(row);
    }
    this.buildGridLayer();
  }

  private buildGridLayer(): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'grid-layer');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');

    for (let i = 1; i < SIZE; i++) {
      const isBox = i % 3 === 0;
      const cls = isBox ? 'grid-box-line' : 'grid-line';

      const vLine = document.createElementNS(SVG_NS, 'line');
      vLine.setAttribute('x1', String(i));
      vLine.setAttribute('y1', '0');
      vLine.setAttribute('x2', String(i));
      vLine.setAttribute('y2', String(SIZE));
      vLine.setAttribute('class', cls);
      svg.appendChild(vLine);

      const hLine = document.createElementNS(SVG_NS, 'line');
      hLine.setAttribute('x1', '0');
      hLine.setAttribute('y1', String(i));
      hLine.setAttribute('x2', String(SIZE));
      hLine.setAttribute('y2', String(i));
      hLine.setAttribute('class', cls);
      svg.appendChild(hLine);
    }

    this.ui.board.insertAdjacentElement('afterend', svg);
    this.gridLayer = svg;
  }

  private buildPad(): void {
    for (let d = 1; d <= SIZE; d++) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'key';
      key.textContent = String(d);
      key.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.preventDefault();
        this.input(d);
      });
      key.addEventListener('click', (event) => {
        if (event.detail === 0) this.input(d);
      });
      this.ui.pad.appendChild(key);
      this.padKeys.push(key);
    }
  }

  private bindEvents(): void {
    const selectFromEvent = (event: Event): void => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if (!target || !this.game || this.busy) return;
      const index = Number(target.dataset.index);
      if (this.game.selected !== index) {
        this.game.select(index);
        this.render();
      }
    };

    this.ui.board.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      selectFromEvent(event);
    });
    this.ui.board.addEventListener('click', selectFromEvent);

    this.ui.undo.addEventListener('click', () => this.afterChange(this.game?.undo()));
    this.ui.erase.addEventListener('click', () => this.afterChange(this.game?.erase()));
    this.ui.hint.addEventListener('click', () => this.afterChange(this.game?.hint()));
    this.ui.notes.addEventListener('click', () => this.toggleNotes());
    this.ui.autoCheck.addEventListener('change', () => {
      if (this.game) {
        this.game.autoCheckMistakes = this.ui.autoCheck.checked;
        this.schedulePersist();
      }
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
      if (document.visibilityState === 'hidden') this.flushPersist();
    });
    window.addEventListener('pagehide', () => this.flushPersist());
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
    } else if (key === 'u' || key === 'U') {
      this.afterChange(this.game.undo());
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
    let next: number;
    if (g.selected === null) {
      next = 4 * SIZE + 4;
    } else {
      const r = rowOf(g.selected);
      const c = colOf(g.selected);
      const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const nr = Math.min(SIZE - 1, Math.max(0, r + dr));
      const nc = Math.min(SIZE - 1, Math.max(0, c + dc));
      next = nr * SIZE + nc;
    }
    g.select(next);
    this.cells[next].root.focus();
    this.render();
  }

  /** Called after any action on the game; `changed` is what the action returned. */
  private afterChange(changed: boolean | undefined): void {
    if (!this.game) return;
    this.render();
    if (changed) {
      if (this.game.finished) this.showWin();
      this.schedulePersist();
    }
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
    this.ui.loading.classList.toggle('is-busy', busy);
    if (busy) {
      this.ui.loading.textContent = 'Creating puzzle…';
      this.ui.loading.hidden = false;
    } else {
      this.ui.loading.hidden = true;
    }
  }

  private setGame(game: Game): void {
    this.game = game;
    this.ui.mode.value = game.puzzle.mode;
    this.ui.difficulty.value = game.puzzle.difficulty;
    this.ui.autoCheck.checked = game.autoCheckMistakes;
    this.layoutPuzzle();
    this.render();
    this.schedulePersist();
  }

  private tick(): void {
    const g = this.game;
    if (!g || this.busy || g.finished || document.visibilityState !== 'visible') return;
    g.elapsedSeconds++;
    this.ui.timer.textContent = formatTime(g.elapsedSeconds);
    if (++this.ticks % 5 === 0) this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistHandle !== null) return;
    if ('requestIdleCallback' in window) {
      this.persistIdle = true;
      this.persistHandle = window.requestIdleCallback(() => {
        this.persistHandle = null;
        this.persistIdle = false;
        this.persist();
      });
    } else {
      this.persistIdle = false;
      this.persistHandle = setTimeout(() => {
        this.persistHandle = null;
        this.persist();
      }, 0) as unknown as number;
    }
  }

  private flushPersist(): void {
    if (this.persistHandle !== null) {
      if (this.persistIdle && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(this.persistHandle);
      } else {
        clearTimeout(this.persistHandle);
      }
      this.persistHandle = null;
      this.persistIdle = false;
    }
    this.persist();
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

  /** Draws cage outlines and sums. Runs once per puzzle. */
  private layoutPuzzle(): void {
    const puzzle = this.game!.puzzle;
    this.cageOf = cageIndexOf(puzzle.cages);

    this.cageLayer?.remove();
    this.cageLayer = null;
    if (puzzle.cages.length === 0) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cage-layer');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', 'cage-outline-mask');

    const maskBg = document.createElementNS(SVG_NS, 'rect');
    maskBg.setAttribute('x', '0');
    maskBg.setAttribute('y', '0');
    maskBg.setAttribute('width', String(SIZE));
    maskBg.setAttribute('height', String(SIZE));
    maskBg.setAttribute('fill', 'white');
    mask.appendChild(maskBg);

    const outlinesGroup = document.createElementNS(SVG_NS, 'g');
    outlinesGroup.setAttribute('mask', 'url(#cage-outline-mask)');

    for (const cage of puzzle.cages) {
      const first = Math.min(...cage.cells);
      const c = colOf(first);
      const r = rowOf(first);
      const digits = String(cage.sum).length;
      const maskW = digits === 1 ? 0.21 : 0.40;
      const maskH = 0.22;

      const maskCut = document.createElementNS(SVG_NS, 'rect');
      maskCut.setAttribute('x', String(round(c + 0.06)));
      maskCut.setAttribute('y', String(round(r + 0.06)));
      maskCut.setAttribute('width', String(maskW));
      maskCut.setAttribute('height', String(maskH));
      maskCut.setAttribute('fill', 'black');
      mask.appendChild(maskCut);

      const outline = document.createElementNS(SVG_NS, 'path');
      outline.setAttribute('class', 'cage-outline');
      outline.setAttribute('d', cageOutlinePath(cage.cells));
      outlinesGroup.appendChild(outline);

      const [x, y] = cageLabelPosition(cage.cells);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'cage-sum');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.textContent = String(cage.sum);
      svg.appendChild(label);
    }

    defs.appendChild(mask);
    svg.insertBefore(outlinesGroup, svg.firstChild);
    svg.insertBefore(defs, svg.firstChild);

    // Insert inside the board frame, above the grid lines and cells.
    if (this.gridLayer) {
      this.gridLayer.insertAdjacentElement('afterend', svg);
    } else {
      this.ui.board.insertAdjacentElement('afterend', svg);
    }
    this.cageLayer = svg;
  }

  private render(): void {
    const g = this.game;
    if (!g) return;

    const sel = g.selected;
    const selValue = sel === null ? 0 : g.values[sel];
    const highlightDigit = sel !== null && selValue !== 0 && !g.isWrong(sel) ? selValue : 0;
    const showWrong = g.autoCheckMistakes;
    const activeIndex = sel !== null ? sel : 0;
    const completedCounts = new Int32Array(SIZE + 1);

    for (let i = 0; i < CELLS; i++) {
      const view = this.cells[i];
      const v = g.values[i];
      if (v !== 0 && v === g.puzzle.solution[i]) {
        completedCounts[v]++;
      }

      const isSelected = i === sel;
      const tabIndex = i === activeIndex ? 0 : -1;
      if (view.lastTabIndex !== tabIndex) {
        view.root.tabIndex = tabIndex;
        view.lastTabIndex = tabIndex;
      }
      if (view.lastSelected !== isSelected) {
        view.root.setAttribute('aria-selected', String(isSelected));
        view.lastSelected = isSelected;
      }

      const flags =
        (g.isGiven(i) ? 1 : 0) |
        (showWrong && g.isWrong(i) ? 2 : 0) |
        (isSelected ? 4 : 0) |
        (sel !== null && i !== sel && this.related(i, sel) ? 8 : 0) |
        (selValue !== 0 && v === selValue && i !== sel ? 16 : 0);

      if (view.lastFlags !== flags) {
        const diff = view.lastFlags ^ flags;
        const cls = view.root.classList;
        if (diff & 1) cls.toggle('given', (flags & 1) !== 0);
        if (diff & 2) cls.toggle('wrong', (flags & 2) !== 0);
        if (diff & 4) cls.toggle('selected', (flags & 4) !== 0);
        if (diff & 8) cls.toggle('peer', (flags & 8) !== 0);
        if (diff & 16) cls.toggle('same', (flags & 16) !== 0);
        view.lastFlags = flags;
      }

      if (view.lastValue !== v) {
        view.value.textContent = v ? String(v) : '';
        view.lastValue = v;
      }

      const effectiveNotes = v ? 0 : g.notes[i];
      if (view.lastNotes !== effectiveNotes) {
        const notesDiff = view.lastNotes ^ effectiveNotes;
        for (let d = 1; d <= SIZE; d++) {
          const mask = bit(d);
          if (notesDiff & mask) {
            view.notes[d - 1].textContent = (effectiveNotes & mask) !== 0 ? String(d) : '';
          }
        }
        view.lastNotes = effectiveNotes;
      }

      const cellHighlightNote =
        highlightDigit !== 0 && (effectiveNotes & bit(highlightDigit)) !== 0 ? highlightDigit : 0;
      if (view.lastHighlightNote !== cellHighlightNote) {
        if (view.lastHighlightNote !== 0) {
          view.notes[view.lastHighlightNote - 1].classList.remove('same');
        }
        if (cellHighlightNote !== 0) {
          view.notes[cellHighlightNote - 1].classList.add('same');
        }
        view.lastHighlightNote = cellHighlightNote;
      }
    }

    const timerStr = formatTime(g.elapsedSeconds);
    if (this.ui.timer.textContent !== timerStr) this.ui.timer.textContent = timerStr;
    const mistakesStr = String(g.mistakes);
    if (this.ui.mistakes.textContent !== mistakesStr) this.ui.mistakes.textContent = mistakesStr;
    this.ui.undo.disabled = !g.canUndo;
    this.ui.notes.setAttribute('aria-pressed', String(this.noteMode));
    this.ui.notes.classList.toggle('active', this.noteMode);
    this.ui.hint.disabled = g.finished;
    this.ui.erase.disabled = g.finished;
    for (let d = 1; d <= SIZE; d++) {
      const key = this.padKeys[d - 1];
      if (key) {
        key.disabled = g.finished || completedCounts[d] === SIZE;
      }
    }
  }

  /** Whether cell i shares a row, column, box or (killer) cage with cell sel. */
  private related(i: number, sel: number): boolean {
    if (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel)) return true;
    return this.cageOf[sel] !== -1 && this.cageOf[i] === this.cageOf[sel];
  }
}
