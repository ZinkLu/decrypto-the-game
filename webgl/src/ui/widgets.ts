// Reusable DOM widgets for the overlay UI.

import type { RoundHistoryRow } from '../protocol';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Circular countdown with an SVG ring. Local, informational — the server
 *  remains the authoritative timekeeper (HANDOFF §2 timeouts). */
export class CountdownRing {
  readonly el: HTMLElement;
  private timer: number | null = null;
  private deadline: number;
  private ring: SVGCircleElement;
  private label: HTMLElement;
  private expired = false;

  constructor(
    private readonly seconds: number,
    private readonly caption: string,
  ) {
    this.deadline = performance.now() + seconds * 1000;
    this.el = el('div', 'countdown');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.classList.add('countdown-svg');
    const track = document.createElementNS(ns, 'circle');
    track.setAttribute('cx', '32');
    track.setAttribute('cy', '32');
    track.setAttribute('r', '26');
    track.classList.add('countdown-track');
    this.ring = document.createElementNS(ns, 'circle');
    this.ring.setAttribute('cx', '32');
    this.ring.setAttribute('cy', '32');
    this.ring.setAttribute('r', '26');
    this.ring.classList.add('countdown-ring');
    svg.append(track, this.ring);
    this.label = el('div', 'countdown-num', String(seconds));
    const cap = el('div', 'countdown-cap', this.caption);
    this.el.append(svg, this.label, cap);
    this.timer = window.setInterval(this.tick, 100);
    this.tick();
  }

  private tick = (): void => {
    const remainMs = this.deadline - performance.now();
    const frac = Math.max(0, remainMs / (this.seconds * 1000));
    const c = 2 * Math.PI * 26;
    this.ring.style.strokeDasharray = `${c}`;
    this.ring.style.strokeDashoffset = `${c * (1 - frac)}`;
    this.label.textContent = String(Math.max(0, Math.ceil(remainMs / 1000)));
    this.el.classList.toggle('countdown-low', remainMs < 15000);
    if (remainMs <= 0 && !this.expired) {
      this.expired = true;
      this.label.textContent = '0';
      this.el.classList.add('countdown-done');
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
    }
  };

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}

/** 3-slot code guess selector (digits 1-4). */
export class DigitSelector {
  readonly el: HTMLElement;
  guesses = [0, 0, 0];
  focus = 1;
  onChange: ((guesses: number[], filled: number, focus: number) => void) | null = null;
  private slots: HTMLElement[] = [];
  private keys: HTMLElement[] = [];
  private disabled = false;

  constructor() {
    this.el = el('div', 'digit-selector');
    const slotsRow = el('div', 'digit-slots');
    for (let i = 0; i < 3; i++) {
      const s = el('button', 'digit-slot', '·');
      s.type = 'button';
      s.addEventListener('click', () => {
        if (this.disabled) return;
        this.focus = i + 1;
        this.render();
      });
      this.slots.push(s);
      slotsRow.append(s);
    }
    const keyRow = el('div', 'digit-keys');
    for (let d = 1; d <= 4; d++) {
      const k = el('button', 'digit-key', String(d));
      k.type = 'button';
      k.addEventListener('click', () => this.pick(d));
      this.keys.push(k);
      keyRow.append(k);
    }
    const clear = el('button', 'digit-key digit-key-clear', '✕');
    clear.type = 'button';
    clear.title = '清除当前位';
    clear.addEventListener('click', () => {
      if (this.disabled) return;
      this.guesses[this.focus - 1] = 0;
      this.emit();
      this.render();
    });
    keyRow.append(clear);
    this.el.append(slotsRow, keyRow);
    window.addEventListener('keydown', this.onKeydown);
    this.render();
  }

  private onKeydown = (ev: KeyboardEvent): void => {
    if (this.disabled) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (ev.key >= '1' && ev.key <= '4') {
      this.pick(Number(ev.key));
    } else if (ev.key === 'Backspace') {
      this.guesses[this.focus - 1] = 0;
      this.emit();
      this.render();
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const d = ev.key === 'ArrowLeft' ? -1 : 1;
      this.focus = ((this.focus - 1 + d + 3) % 3) + 1;
      this.render();
    }
  };

  private pick(d: number): void {
    if (this.disabled) return;
    this.guesses[this.focus - 1] = d;
    // advance to next empty slot
    for (let step = 1; step <= 3; step++) {
      const next = ((this.focus - 1 + step) % 3) + 1;
      if (this.guesses[next - 1] === 0) {
        this.focus = next;
        break;
      }
    }
    this.emit();
    this.render();
  }

  private emit(): void {
    const filled = this.guesses.filter((g) => g !== 0).length;
    this.onChange?.([...this.guesses], filled, this.focus);
  }

  get filled(): number {
    return this.guesses.filter((g) => g !== 0).length;
  }

  setDisabled(b: boolean): void {
    this.disabled = b;
    this.el.classList.toggle('disabled', b);
  }

  private render(): void {
    this.slots.forEach((s, i) => {
      s.textContent = this.guesses[i] === 0 ? '·' : String(this.guesses[i]);
      s.classList.toggle('active', this.focus === i + 1 && !this.disabled);
      s.classList.toggle('filled', this.guesses[i] !== 0);
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeydown);
  }
}

/** Numbered clue display. */
export function clueBoard(clues: string[], title = '截获的线索'): HTMLElement {
  const box = el('div', 'clue-board');
  box.append(el('div', 'panel-title', title));
  const list = el('div', 'clue-list');
  for (let i = 0; i < 3; i++) {
    const row = el('div', 'clue-row');
    row.append(el('span', 'clue-idx', `0${i + 1}`));
    const text = clues[i] && clues[i].trim() !== '' ? clues[i] : '···';
    row.append(el('span', 'clue-text', text));
    list.append(row);
  }
  box.append(list);
  return box;
}

/** The player's own 4 secret words, indexed 1-4. */
export function wordsStrip(words: string[], title = '我方密码本'): HTMLElement {
  const box = el('div', 'words-strip');
  box.append(el('div', 'panel-title', title));
  const row = el('div', 'words-row');
  words.forEach((w, i) => {
    const chip = el('div', 'word-chip');
    chip.append(el('span', 'word-idx', String(i + 1)));
    chip.append(el('span', 'word-text', w));
    row.append(chip);
  });
  box.append(row);
  return box;
}

function digitsTriple(digits: number[] | undefined, cls: string): HTMLElement {
  const wrap = el('span', `triple ${cls}`);
  if (!digits || digits.length === 0) {
    wrap.append(el('span', 'triple-empty', '———'));
    return wrap;
  }
  const arr = [0, 1, 2].map((i) => (digits[i] ?? 0) > 0 && (digits[i] ?? 0) <= 4 ? String(digits[i]) : '·');
  wrap.textContent = arr.join(' ');
  return wrap;
}

/** Scrollable round-history table (auto-scrolls to newest). */
export function historyPanel(rows: RoundHistoryRow[], myTeam: string): HTMLElement {
  const box = el('div', 'history-panel');
  box.append(el('div', 'panel-title', '情报档案 · 回合历史'));
  const list = el('div', 'history-list');
  if (rows.length === 0) {
    list.append(el('div', 'history-empty', '暂无记录 —— 第一轮行动进行中'));
  }
  for (const r of rows) {
    const row = el('div', `history-row${r.team === myTeam ? ' mine' : ''}`);
    const head = el('div', 'history-head');
    head.append(el('span', 'history-round', `R${r.round}`));
    head.append(el('span', `team-badge team-${r.team.toLowerCase()}`, `${r.team} 队`));
    row.append(head);
    const clues = el('div', 'history-clues');
    r.clues.forEach((c, i) => {
      clues.append(el('span', 'history-clue', `${i + 1}. ${c}`));
    });
    row.append(clues);
    const codes = el('div', 'history-codes');
    codes.append(el('span', 'history-code-label', '密码'));
    codes.append(digitsTriple(r.secret, 'triple-secret'));
    codes.append(el('span', 'history-code-label', '拦截'));
    codes.append(digitsTriple(r.intercept, 'triple-intercept'));
    codes.append(el('span', 'history-code-label', '解密'));
    codes.append(digitsTriple(r.decrypt, 'triple-decrypt'));
    row.append(codes);
    list.append(row);
  }
  box.append(list);
  // newest at the bottom
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
  return box;
}

/** Toast stack (top-center). */
export class Toasts {
  readonly el: HTMLElement;
  constructor() {
    this.el = el('div', 'toast-root');
  }
  show(message: string): void {
    while (this.el.children.length >= 3) this.el.firstElementChild?.remove();
    const t = el('div', 'toast', message);
    this.el.append(t);
    window.setTimeout(() => t.classList.add('toast-out'), 3600);
    window.setTimeout(() => t.remove(), 4200);
  }
}

/** Typing-style animated dots used in waiting views. */
export function thinkingDots(text: string): HTMLElement {
  const wrap = el('div', 'thinking');
  wrap.append(el('span', 'thinking-text', text));
  const dots = el('span', 'thinking-dots');
  for (let i = 0; i < 3; i++) dots.append(el('span', 'thinking-dot', '·'));
  wrap.append(dots);
  return wrap;
}

/** Score pips: ● for earned marks. */
export function scorePips(filled: number, cls: string): HTMLElement {
  const wrap = el('span', `pips ${cls}`);
  for (let i = 0; i < 2; i++) {
    wrap.append(el('span', `pip${i < filled ? ' on' : ''}`, '●'));
  }
  return wrap;
}
