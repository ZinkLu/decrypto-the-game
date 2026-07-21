// View implementations — one per UI state listed in HANDOFF_THREEJS.md §6.
// All views render inside the room's main screen; the archive (history)
// lives in the side screen and is owned by the app shell, not by views.

import type { GameState, Phase, Store } from '../store';
import type { PlayerInfo } from '../protocol';
import {
  CountdownRing,
  DigitSelector,
  WordAssign,
  clueBoard,
  el,
  phaseStrip,
  scorePips,
  thinkingDots,
  wordsStrip,
} from './widgets';

export interface View {
  readonly id: string;
  readonly el: HTMLElement;
  update(s: GameState): void;
  dispose(): void;
}

abstract class BaseView implements View {
  abstract readonly id: string;
  readonly el = el('div', 'view');
  protected disposables: { dispose(): void }[] = [];
  constructor(protected readonly store: Store) {}
  update(_s: GameState): void {}
  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.el.remove();
  }
}

const ACTION_LABEL: Record<string, string> = {
  encrypt: '编制密电',
  intercept: '拦截破译',
  decrypt: '解密核对',
};

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'encrypting':
      return '加密中';
    case 'intercept':
      return '拦截窗口';
    case 'decrypt':
      return '解密窗口';
    case 'round_result':
      return '回合结算';
    case 'game_over':
      return '行动结束';
    default:
      return '';
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'encryptor':
      return '你是本回合加密者';
    case 'teammate':
      return '你是解密方（加密者队友）';
    case 'opponent':
      return '你是拦截方（敌方全员）';
    default:
      return '';
  }
}

/** Live monitor card: latest other-player progress + AI status for an action.
 *  Re-renders only when the underlying data changes (signature guard). */
function monitorCard(s: GameState, action: string): HTMLElement {
  const box = el('div', 'monitor');
  box.append(el('div', 'panel-title', '实时监控'));
  const rows = el('div', 'monitor-rows');
  box.append(rows);
  box.dataset.action = action;
  paintMonitor(box, s);
  return box;
}

function paintMonitor(box: HTMLElement, s: GameState): void {
  const action = box.dataset.action ?? '';
  const p = s.progress && s.progress.action === action && s.progress.player !== s.myNickname
    ? s.progress
    : null;
  const ai = s.aiStatus && s.aiStatus.action === action ? s.aiStatus : null;
  const sig = JSON.stringify([p, ai]);
  if (sig === box.dataset.sig) return;
  box.dataset.sig = sig;

  const rows = box.querySelector('.monitor-rows') as HTMLElement;
  rows.textContent = '';
  let any = false;
  if (ai) {
    any = true;
    const row = el('div', 'monitor-row');
    row.append(el('span', 'monitor-name monitor-ai', `◈ ${ai.player}`));
    row.append(el('span', 'monitor-state', `${ACTION_LABEL[ai.action] ?? ai.action} ${ai.step}/${ai.total}`));
    rows.append(row);
  }
  if (p) {
    any = true;
    const row = el('div', 'monitor-row');
    row.append(el('span', 'monitor-name', p.player));
    const dots = el('span', 'monitor-dots');
    for (let i = 0; i < 3; i++) {
      const on = p.guesses ? (p.guesses[i] ?? 0) > 0 : i < p.step;
      dots.append(el('span', `monitor-dot${on ? ' on' : ''}${p.focus === i + 1 ? ' focus' : ''}`, '●'));
    }
    row.append(dots);
    const stateText =
      p.state === 'submitted' ? '已提交' : p.state === 'editing' ? '输入中' : '待命';
    row.append(el('span', `monitor-state${p.state === 'submitted' ? ' submitted' : ''}`, stateText));
    rows.append(row);
  }
  if (!any) {
    // say who we're waiting for — never a bare "silence"
    const waiting =
      action === 'encrypt'
        ? `等待 ${s.encryptor || '加密者'} 动笔…`
        : action === 'intercept'
          ? '等待拦截方落子…'
          : '等待解密方核对…';
    rows.append(el('div', 'monitor-empty', waiting));
  }
}

function refreshMonitor(card: HTMLElement, s: GameState): void {
  paintMonitor(card, s);
}

// ---------------------------------------------------------------------------
// 1. Home
// ---------------------------------------------------------------------------

export class HomeView extends BaseView {
  readonly id = 'home';
  private nickInput: HTMLInputElement;
  private codeInput: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private notice: HTMLElement;
  private connDot: HTMLElement;
  private connText: HTMLElement;
  private tabCreate: HTMLButtonElement;
  private tabJoin: HTMLButtonElement;
  private codeField: HTMLElement;
  private tab: 'create' | 'join' = 'create';

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-home');

    const wrap = el('div', 'home-wrap');
    const brand = el('div', 'brand');
    brand.append(el('div', 'brand-top', 'TOP SECRET · 机密'));
    brand.append(el('h1', 'brand-title', '谍报风云'));
    brand.append(el('div', 'brand-sub', 'DECRYPTO · 冷战密码战'));
    wrap.append(brand);

    const brief = el('div', 'brief');
    brief.append(el('div', 'brief-line', '用线索传递密码：让队友听懂，让敌人迷路。'));
    const meta = el('div', 'brief-meta');
    meta.append(el('span', '', '4–8 人 · 约 30 分钟 · 人手不足可 AI 补位'));
    const howto = el('button', 'brief-howto', '怎么玩？');
    howto.type = 'button';
    howto.addEventListener('click', () => window.dispatchEvent(new CustomEvent('decrypto:howto')));
    meta.append(howto);
    brief.append(meta);
    wrap.append(brief);

    const card = el('div', 'home-card');

    // two clearly separated paths: start a new operation vs. answer a call
    const tabs = el('div', 'home-tabs');
    this.tabCreate = el('button', 'home-tab active', '新建行动');
    this.tabCreate.type = 'button';
    this.tabCreate.addEventListener('click', () => this.setTab('create'));
    this.tabJoin = el('button', 'home-tab', '应召加入');
    this.tabJoin.type = 'button';
    this.tabJoin.addEventListener('click', () => this.setTab('join'));
    tabs.append(this.tabCreate, this.tabJoin);
    card.append(tabs);

    const form = el('form', 'home-form') as HTMLFormElement;
    const nickField = el('label', 'field');
    nickField.append(el('span', 'field-label', '你的代号（其他玩家看到的名字）'));
    this.nickInput = el('input', 'input');
    this.nickInput.placeholder = '夜莺';
    this.nickInput.maxLength = 16;
    this.nickInput.value = window.localStorage.getItem('decrypto-nick') ?? '';
    nickField.append(this.nickInput);
    form.append(nickField);

    this.codeField = el('label', 'field hidden');
    this.codeField.append(el('span', 'field-label', '频道代码（朋友分享给你的）'));
    this.codeInput = el('input', 'input input-mono');
    this.codeInput.placeholder = '例如 X7K2';
    this.codeInput.maxLength = 8;
    this.codeField.append(this.codeInput);
    form.append(this.codeField);

    this.submitBtn = el('button', 'btn btn-primary btn-block', '创建新频道');
    this.submitBtn.type = 'submit';
    form.append(this.submitBtn);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.submit();
    });
    card.append(form);

    this.notice = el('div', 'home-notice');
    card.append(this.notice);
    wrap.append(card);

    const conn = el('div', 'home-conn');
    this.connDot = el('span', 'conn-dot');
    this.connText = el('span', '', '接通线路中…');
    conn.append(this.connDot, this.connText);
    wrap.append(conn);

    this.el.append(wrap);
  }

  private setTab(tab: 'create' | 'join'): void {
    this.tab = tab;
    this.tabCreate.classList.toggle('active', tab === 'create');
    this.tabJoin.classList.toggle('active', tab === 'join');
    this.codeField.classList.toggle('hidden', tab === 'create');
    this.submitBtn.textContent = tab === 'create' ? '创建新频道' : '加入频道';
    if (tab === 'join') this.codeInput.focus();
    else this.nickInput.focus();
  }

  private nickname(): string {
    const nick = this.nickInput.value.trim();
    if (!nick) {
      this.store.showToast('请先输入代号');
      this.nickInput.focus();
      return '';
    }
    window.localStorage.setItem('decrypto-nick', nick);
    return nick;
  }

  private submit(): void {
    const nick = this.nickname();
    if (!nick) return;
    if (this.tab === 'create') {
      this.store.createRoom(nick);
      return;
    }
    const code = this.codeInput.value.trim().toUpperCase();
    if (!code) {
      this.store.showToast('请填写频道代码');
      this.codeInput.focus();
      return;
    }
    this.store.joinRoom(code, nick);
  }

  update(s: GameState): void {
    this.submitBtn.disabled = !s.connected;
    this.connDot.className = `conn-dot${s.connected ? ' on' : ''}`;
    this.connText.textContent = s.connected ? '线路已接通' : '线路中断 · 重连中…';
    this.notice.textContent = s.notice ?? '';
    this.notice.classList.toggle('show', !!s.notice);
  }
}

// ---------------------------------------------------------------------------
// 2. Lobby — signature-guarded: progress broadcasts don't repaint the room
// ---------------------------------------------------------------------------

export class LobbyView extends BaseView {
  readonly id = 'lobby';
  private seen = '';

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-lobby');
  }

  update(s: GameState): void {
    const sig = JSON.stringify([
      s.roomCode,
      s.players,
      s.teamA,
      s.teamB,
      s.ownerID,
      s.canStart,
      s.myPlayerID,
    ]);
    if (sig === this.seen) return;
    this.seen = sig;

    this.el.textContent = '';
    const wrap = el('div', 'lobby-wrap');
    const head = el('div', 'lobby-head');
    head.append(el('div', 'panel-title', '行动集结点'));
    const code = el('button', 'lobby-code', s.roomCode ?? '····');
    code.type = 'button';
    code.title = '点击复制频道代码';
    code.addEventListener('click', () => {
      if (s.roomCode) {
        void navigator.clipboard?.writeText(s.roomCode).catch(() => undefined);
        this.store.showToast('频道代码已复制');
      }
    });
    head.append(code);
    head.append(el('div', 'lobby-hint', '分享代码，召集双方特工（每队至少 2 人）'));
    wrap.append(head);

    const isOwner = s.myPlayerID !== '' && s.myPlayerID === s.ownerID;
    const myTeam = s.teamA.some((p) => p.id === s.myPlayerID)
      ? 'A'
      : s.teamB.some((p) => p.id === s.myPlayerID)
        ? 'B'
        : null;

    const teams = el('div', 'lobby-teams');
    teams.append(this.teamPanel(s, 'A', s.teamA, isOwner, myTeam));
    teams.append(this.teamPanel(s, 'B', s.teamB, isOwner, myTeam));
    wrap.append(teams);

    const assigned = new Set([...s.teamA, ...s.teamB].map((p) => p.id));
    const free = s.players.filter((p) => !assigned.has(p.id));
    if (free.length > 0) {
      const freeRow = el('div', 'lobby-free');
      freeRow.append(el('span', 'lobby-free-label', '待分配：'));
      for (const p of free) {
        freeRow.append(el('span', 'chip chip-free', `${p.nickname}${p.id === s.myPlayerID ? '（我）' : ''}`));
      }
      wrap.append(freeRow);
    }

    const foot = el('div', 'lobby-foot');
    if (isOwner) {
      const aiRow = el('div', 'btn-row');
      const addA = el('button', 'btn btn-small', '+ AI → A 队');
      addA.type = 'button';
      addA.addEventListener('click', () => this.store.addAI('A'));
      const addB = el('button', 'btn btn-small', '+ AI → B 队');
      addB.type = 'button';
      addB.addEventListener('click', () => this.store.addAI('B'));
      aiRow.append(addA, addB);
      foot.append(aiRow);

      const start = el('button', 'btn btn-primary btn-start', '开始行动');
      start.type = 'button';
      start.disabled = !s.canStart;
      start.addEventListener('click', () => this.store.startGame());
      foot.append(start);
      if (!s.canStart) foot.append(el('div', 'lobby-warn', '每队至少需要 2 名成员（可添加 AI）'));
    } else {
      foot.append(thinkingDots('等待房主下达行动指令'));
    }
    wrap.append(foot);
    this.el.append(wrap);
  }

  private teamPanel(
    s: GameState,
    team: 'A' | 'B',
    members: PlayerInfo[],
    isOwner: boolean,
    myTeam: 'A' | 'B' | null,
  ): HTMLElement {
    const panel = el('div', `team-panel team-panel-${team.toLowerCase()}`);
    const title = el('div', 'team-title');
    title.append(el('span', `team-badge team-${team.toLowerCase()}`, `${team} 队`));
    title.append(el('span', 'team-count', `${members.length} 人`));
    panel.append(title);

    const list = el('div', 'team-list');
    members.forEach((p, idx) => {
      const chip = el('div', 'chip');
      chip.append(el('span', '', p.nickname));
      if (p.is_ai) chip.append(el('span', 'chip-badge chip-ai', 'AI'));
      if (p.id === s.ownerID) chip.append(el('span', 'chip-badge chip-owner', '房主'));
      if (p.id === s.myPlayerID) chip.append(el('span', 'chip-badge chip-me', '我'));
      if (isOwner && p.is_ai) {
        const rm = el('button', 'chip-remove', '✕');
        rm.type = 'button';
        rm.title = '移除该 AI';
        rm.addEventListener('click', () => this.store.removeAI(team, idx));
        chip.append(rm);
      }
      list.append(chip);
    });
    if (members.length === 0) list.append(el('div', 'team-empty', '虚位以待'));
    panel.append(list);

    const joinBtn = el('button', 'btn btn-small btn-join', myTeam === team ? '离开该队' : '加入该队');
    joinBtn.type = 'button';
    joinBtn.addEventListener('click', () => {
      if (myTeam === team) this.store.leaveTeam();
      else this.store.selectTeam(team);
    });
    panel.append(joinBtn);
    return panel;
  }
}

// ---------------------------------------------------------------------------
// Shared game-view helpers
// ---------------------------------------------------------------------------

function viewHeader(title: string, sub: string, countdown?: CountdownRing): HTMLElement {
  const head = el('div', 'view-header');
  const text = el('div', 'view-header-text');
  text.append(el('div', 'view-title', title));
  if (sub) text.append(el('div', 'view-sub', sub));
  head.append(text);
  if (countdown) head.append(countdown.el);
  return head;
}

/** Round guidance: flow strip + role banner, on top of every game view. */
function guidance(s: GameState): HTMLElement {
  const box = el('div', 'guidance');
  box.append(phaseStrip(s.phase, s.round));
  box.append(el('div', 'role-line', roleLabel(s.myRole)));
  return box;
}

function codeCards(digits: number[], words: string[], title: string): HTMLElement {
  const box = el('div', 'code-cards');
  box.append(el('div', 'panel-title', title));
  const row = el('div', 'code-card-row');
  for (let i = 0; i < 3; i++) {
    const card = el('div', 'code-card');
    card.append(el('div', 'code-card-digit', String(digits[i] ?? '·')));
    card.append(el('div', 'code-card-word', words[i] ?? '—'));
    card.append(el('div', 'code-card-idx', `线索 0${i + 1}`));
    row.append(card);
  }
  box.append(row);
  return box;
}

// ---------------------------------------------------------------------------
// 3. Encrypt view (encryptor during ENCRYPTING)
// ---------------------------------------------------------------------------

export class EncryptView extends BaseView {
  readonly id = 'encrypt';
  private inputs: HTMLInputElement[] = [];
  private submitBtn: HTMLButtonElement;
  private submitted = false;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(90, '出题剩余', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel');
    center.append(guidance(s));
    center.append(
      viewHeader(
        '你的回合 · 你是加密者',
        `第 ${s.round} 回合 · 为 ${s.secretDigits.join('-')} 各写一条线索：队友要懂，敌人要懵`,
        ring,
      ),
    );
    center.append(codeCards(s.secretDigits, s.secretWords, '本轮密码 · 绝密'));

    const clueBox = el('div', 'clue-inputs');
    for (let i = 0; i < 3; i++) {
      const field = el('label', 'field field-clue');
      const digit = s.secretDigits[i] ?? 0;
      const word = digit > 0 ? (s.myWords[digit - 1] ?? '?') : '?';
      field.append(el('span', 'field-label', `线索 0${i + 1} → 词位 ${digit} · ${word}`));
      const input = el('input', 'input');
      input.placeholder = '一句话暗示，别说漏嘴';
      input.maxLength = 24;
      input.addEventListener('focus', () => this.emitProgress('editing', i + 1));
      input.addEventListener('input', () => this.emitProgress('editing', i + 1));
      // Enter hops to the next clue; on the last one it sends the wire
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (i < 2) this.inputs[i + 1].focus();
        else this.submit();
      });
      this.inputs.push(input);
      field.append(input);
      clueBox.append(field);
    }
    center.append(clueBox);

    const btnRow = el('div', 'btn-row');
    this.submitBtn = el('button', 'btn btn-primary', '发出密电');
    this.submitBtn.type = 'button';
    this.submitBtn.addEventListener('click', () => this.submit());
    btnRow.append(this.submitBtn);
    center.append(btnRow);
    this.submitState = el('div', 'submit-state');
    center.append(this.submitState);

    this.el.append(center);
    this.refreshSubmitBtn();
    this.inputs[0]?.focus();
    this.emitProgress('idle', 0);
  }

  private submitState: HTMLElement;

  private filledCount(): number {
    return this.inputs.filter((i) => i.value.trim() !== '').length;
  }

  private emitProgress(state: 'idle' | 'editing' | 'submitted', focus: number): void {
    this.store.sendProgress('encrypt', this.filledCount(), { state, focus });
  }

  private refreshSubmitBtn(): void {
    this.submitBtn.disabled = this.submitted || this.filledCount() < 3;
    for (const input of this.inputs) {
      input.oninput = () => {
        this.refreshSubmitBtn();
      };
    }
  }

  private submit(): void {
    if (this.submitted || this.filledCount() < 3) return;
    const clues = this.inputs.map((i) => i.value.trim()) as [string, string, string];
    this.store.submitClues(clues);
    this.submitted = true;
    this.emitProgress('submitted', 0);
    this.inputs.forEach((i) => (i.disabled = true));
    this.submitBtn.disabled = true;
    this.submitState.textContent = '密电已发出 · 等待频道广播…';
    this.submitState.classList.add('show');
  }

  update(_s: GameState): void {
    this.refreshSubmitBtn();
  }
}

// ---------------------------------------------------------------------------
// 4. Waiting-for-clues view (teammate / opponent during ENCRYPTING)
// ---------------------------------------------------------------------------

export class WaitCluesView extends BaseView {
  readonly id = 'wait-clues';
  private monitor: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;
    const isOpponent = s.myRole === 'opponent';

    const ring = new CountdownRing(90, '出题剩余', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel');
    center.append(guidance(s));
    const title = isOpponent
      ? `敌方加密者 ${s.encryptor} 正在出题`
      : `${s.encryptor} 正在编制密电`;
    const sub = isOpponent
      ? s.round < 3
        ? '第 1–2 回合无拦截阶段 —— 记录每条线索，建立对方的词序假设'
        : '准备拦截：结合历史线索，推理对方的词序'
      : '线索公开后立即核对密码 —— 失误两次即告失败';
    center.append(viewHeader(`第 ${s.round} 回合 · ${phaseLabel('encrypting')}`, sub, ring));
    const titleRow = el('div', 'wait-title', title);
    center.append(titleRow);
    center.append(thinkingDots(`等待 ${s.encryptor} 发出线索`));
    center.append(wordsStrip(s.myWords));
    this.monitor = monitorCard(s, 'encrypt');
    center.append(this.monitor);

    this.el.append(center);
  }

  update(s: GameState): void {
    refreshMonitor(this.monitor, s);
  }
}

// ---------------------------------------------------------------------------
// 5. Intercept input view (opponent during INTERCEPT)
// ---------------------------------------------------------------------------

export class InterceptInputView extends BaseView {
  readonly id = 'intercept-input';
  private selector: DigitSelector;
  private submitBtn: HTMLButtonElement;
  private abortBtn: HTMLButtonElement;
  private submitted = false;
  private submitState: HTMLElement;
  private echo: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(60, '拦截窗口', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel alert');
    center.append(guidance(s));
    center.append(
      viewHeader(
        '你的回合 · 拦截破译',
        `第 ${s.round} 回合 · 对方 4 个词不可见 —— 推理每条线索对应的词位（1–4）`,
        ring,
      ),
    );
    center.append(clueBoard(s.clues, '截获的敌方线索'));

    this.selector = new DigitSelector();
    this.disposables.push(this.selector);
    this.echo = el('div', 'digit-echo');
    this.selector.onChange = (guesses, filled, focus) => {
      this.store.sendProgress('intercept', filled, {
        state: 'editing',
        focus,
        guesses,
      });
      this.paintEcho(guesses);
      this.refreshBtns();
    };
    center.append(this.selector.el);
    center.append(this.echo);
    this.paintEcho([0, 0, 0]);

    const btnRow = el('div', 'btn-row');
    this.submitBtn = el('button', 'btn btn-danger', '发出拦截');
    this.submitBtn.type = 'button';
    this.submitBtn.disabled = true;
    this.submitBtn.addEventListener('click', () => this.submit(false));
    this.abortBtn = el('button', 'btn', '放弃拦截');
    this.abortBtn.type = 'button';
    this.abortBtn.addEventListener('click', () => this.submit(true));
    btnRow.append(this.submitBtn, this.abortBtn);
    center.append(btnRow);
    this.submitState = el('div', 'submit-state');
    center.append(this.submitState);

    this.el.append(center);
    this.store.sendProgress('intercept', 0, { state: 'idle', guesses: [0, 0, 0] });
  }

  private paintEcho(guesses: number[]): void {
    this.echo.textContent = guesses
      .map((g, i) => `线索 0${i + 1} → ${g > 0 ? `第 ${g} 位` : '？'}`)
      .join('　·　');
  }

  private refreshBtns(): void {
    this.submitBtn.disabled = this.submitted || this.selector.filled < 3;
    this.abortBtn.disabled = this.submitted;
  }

  private submit(abort: boolean): void {
    if (this.submitted) return;
    this.submitted = true;
    const guess = (abort ? [0, 0, 0] : this.selector.guesses) as [number, number, number];
    this.store.submitIntercept(guess);
    this.store.sendProgress('intercept', 3, { state: 'submitted', guesses: guess });
    this.selector.setDisabled(true);
    this.refreshBtns();
    this.submitState.textContent = abort
      ? '已放弃本轮拦截 · 等待判定…'
      : '拦截密电已发出 · 等待判定…';
    this.submitState.classList.add('show');
  }

  update(_s: GameState): void {}
}

// ---------------------------------------------------------------------------
// 6. Intercept watch view (encryptor / teammate during INTERCEPT)
// ---------------------------------------------------------------------------

export class InterceptWatchView extends BaseView {
  readonly id = 'intercept-watch';
  private monitor: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(60, '拦截窗口', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel alert');
    center.append(guidance(s));
    center.append(
      viewHeader(
        `第 ${s.round} 回合 · 警报`,
        '敌方正在破译我方密电 —— 拦截成功两次我方即告失败',
        ring,
      ),
    );
    center.append(clueBoard(s.clues, '我方已发出的线索'));
    center.append(wordsStrip(s.myWords));
    this.monitor = monitorCard(s, 'intercept');
    center.append(this.monitor);

    this.el.append(center);
  }

  update(s: GameState): void {
    refreshMonitor(this.monitor, s);
  }
}

// ---------------------------------------------------------------------------
// 7. Decrypt input view (teammate during DECRYPT) — click words, not digits
// ---------------------------------------------------------------------------

export class DecryptInputView extends BaseView {
  readonly id = 'decrypt-input';
  private assign: WordAssign;
  private submitBtn: HTMLButtonElement;
  private submitted = false;
  private submitState: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(60, '解密窗口', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel');
    center.append(guidance(s));
    center.append(
      viewHeader(
        '你的回合 · 解密核对',
        `第 ${s.round} 回合 · 给每条线索点选我方密码本中的词 —— 词位即密码`,
        ring,
      ),
    );

    this.assign = new WordAssign(s.clues, s.myWords);
    this.disposables.push(this.assign);
    this.assign.onChange = (guesses, filled, focus) => {
      this.store.sendProgress('decrypt', filled, { state: 'editing', focus, guesses });
      this.submitBtn.disabled = this.submitted || filled < 3;
    };
    center.append(this.assign.el);

    const btnRow = el('div', 'btn-row');
    this.submitBtn = el('button', 'btn btn-primary', '确认密码');
    this.submitBtn.type = 'button';
    this.submitBtn.disabled = true;
    this.submitBtn.addEventListener('click', () => this.submit());
    btnRow.append(this.submitBtn);
    center.append(btnRow);
    this.submitState = el('div', 'submit-state');
    center.append(this.submitState);

    this.el.append(center);
    this.store.sendProgress('decrypt', 0, { state: 'idle', guesses: [0, 0, 0] });
  }

  private submit(): void {
    if (this.submitted || this.assign.filled < 3) return;
    this.submitted = true;
    const guess = this.assign.guesses as [number, number, number];
    this.store.submitDecrypt(guess);
    this.store.sendProgress('decrypt', 3, { state: 'submitted', guesses: guess });
    this.assign.setDisabled(true);
    this.submitBtn.disabled = true;
    this.submitState.textContent = '密码已提交 · 等待核对…';
    this.submitState.classList.add('show');
  }

  update(_s: GameState): void {}
}

// ---------------------------------------------------------------------------
// 8. Decrypt watch view (encryptor during DECRYPT — knows the answer)
// ---------------------------------------------------------------------------

export class DecryptWatchView extends BaseView {
  readonly id = 'decrypt-watch';
  private monitor: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(60, '解密窗口', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel');
    center.append(guidance(s));
    center.append(viewHeader(`第 ${s.round} 回合 · 队友正在解密`, '你知道答案 —— 保持沉默，静观其变', ring));
    center.append(codeCards(s.secretDigits, s.secretWords, '本轮密码 · 答案'));
    center.append(clueBoard(s.clues, '你已发出的线索'));
    this.monitor = monitorCard(s, 'decrypt');
    center.append(this.monitor);

    this.el.append(center);
  }

  update(s: GameState): void {
    refreshMonitor(this.monitor, s);
  }
}

// ---------------------------------------------------------------------------
// 9. Post-intercept standby view (opponent during DECRYPT)
// ---------------------------------------------------------------------------

export class DecryptStandbyView extends BaseView {
  readonly id = 'decrypt-standby';
  private monitor: HTMLElement;

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-game');
    const s = store.state;

    const ring = new CountdownRing(60, '解密窗口', s.phaseDeadline);
    this.disposables.push(ring);

    const center = el('div', 'action-panel');
    center.append(guidance(s));
    center.append(
      viewHeader(
        `第 ${s.round} 回合 · 待命`,
        '我方拦截判定完毕 —— 等待对方解密结果（对方失误两次则我方获胜）',
        ring,
      ),
    );
    center.append(clueBoard(s.clues, '敌方的线索'));
    center.append(thinkingDots('监听对方解密频道'));
    this.monitor = monitorCard(s, 'decrypt');
    center.append(this.monitor);

    this.el.append(center);
  }

  update(s: GameState): void {
    refreshMonitor(this.monitor, s);
  }
}

// ---------------------------------------------------------------------------
// 10. Round result view
// ---------------------------------------------------------------------------

export class ResultView extends BaseView {
  readonly id = 'result';
  private lastKey = '';

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-result');
  }

  update(s: GameState): void {
    const r = s.result;
    if (!r) return;
    const key = `${r.interceptSuccess}|${r.decryptSuccess}|${s.scoreA.interceptions}${s.scoreA.decrypt_failures}${s.scoreB.interceptions}${s.scoreB.decrypt_failures}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.el.textContent = '';
    const wrap = el('div', 'result-wrap');
    const iAmOpponent = s.myRole === 'opponent';

    if (r.interceptSuccess !== undefined) {
      const goodForMe = r.interceptSuccess === iAmOpponent;
      wrap.append(
        this.banner(
          r.interceptSuccess ? '拦截成功' : '拦截失败',
          r.interceptSuccess
            ? '密电被破译 —— 拦截方计一分'
            : '防线守住了 —— 进入解密阶段',
          goodForMe,
        ),
      );
    }
    if (r.decryptSuccess !== undefined) {
      const goodForMe = r.decryptSuccess !== iAmOpponent;
      wrap.append(
        this.banner(
          r.decryptSuccess ? '解密成功' : '解密失败',
          r.decryptSuccess
            ? '密码核对无误'
            : '解密方失误计数 +1 —— 两次失误即告失败',
          goodForMe,
        ),
      );
    }

    const recap = el('div', 'result-recap');
    recap.append(clueBoard(s.clues, '本轮线索'));
    if (s.secretDigits.length === 3 && s.secretDigits.some((d) => d > 0)) {
      recap.append(codeCards(s.secretDigits, s.secretWords, '本轮密码'));
    } else {
      recap.append(el('div', 'result-secret-note', '本轮密码将随后归档公开'));
    }
    wrap.append(recap);

    const scores = el('div', 'result-scores');
    scores.append(this.scoreRow('A', s.scoreA, s.myTeam === 'A'));
    scores.append(this.scoreRow('B', s.scoreB, s.myTeam === 'B'));
    wrap.append(scores);

    wrap.append(el('div', 'result-next', '下一阶段即将开始…'));
    this.el.append(wrap);
  }

  private banner(title: string, sub: string, goodForMe: boolean): HTMLElement {
    const b = el('div', `result-banner ${goodForMe ? 'good' : 'bad'}`);
    b.append(el('div', 'result-banner-title', title));
    b.append(el('div', 'result-banner-sub', sub));
    return b;
  }

  private scoreRow(team: string, score: { interceptions: number; decrypt_failures: number }, mine: boolean): HTMLElement {
    const row = el('div', `result-score-row${mine ? ' mine' : ''}`);
    row.append(el('span', `team-badge team-${team.toLowerCase()}`, `${team} 队`));
    const ints = el('span', 'result-score-item');
    ints.append(el('span', 'result-score-label', '拦截'));
    ints.append(scorePips(score.interceptions, 'pips-intercept'));
    const fails = el('span', 'result-score-item');
    fails.append(el('span', 'result-score-label', '失误'));
    fails.append(scorePips(score.decrypt_failures, 'pips-fail'));
    row.append(ints, fails);
    return row;
  }
}

// ---------------------------------------------------------------------------
// 11. Game over view
// ---------------------------------------------------------------------------

export class GameOverView extends BaseView {
  readonly id = 'gameover';

  constructor(store: Store) {
    super(store);
    this.el.classList.add('view-result');
    const s = store.state;
    const winner = s.gameOver?.winner ?? null;

    const wrap = el('div', 'result-wrap');
    const iWon = winner !== null && winner === s.myTeam;
    const banner = el('div', `result-banner big ${winner === null ? '' : iWon ? 'good' : 'bad'}`);
    banner.append(
      el(
        'div',
        'result-banner-title',
        winner === null ? '平局 · 战线冻结' : iWon ? '任务达成 · 我方获胜' : '行动失败 · 敌方获胜',
      ),
    );
    banner.append(
      el('div', 'result-banner-sub', winner === null ? '16 回合耗尽，胜负未分' : `${winner} 队 赢得这场密码战`),
    );
    wrap.append(banner);

    const scores = el('div', 'result-final');
    scores.append(el('div', 'panel-title', '最终战果'));
    for (const [team, score] of [
      ['A', s.scoreA],
      ['B', s.scoreB],
    ] as const) {
      const row = el('div', 'result-score-row');
      row.append(el('span', `team-badge team-${team.toLowerCase()}`, `${team} 队`));
      row.append(
        el(
          'span',
          'result-score-final',
          `拦截成功 ${score.interceptions} · 解密失误 ${score.decrypt_failures}`,
        ),
      );
      scores.append(row);
    }
    wrap.append(scores);

    const home = el('button', 'btn btn-primary', '返回指挥部');
    home.type = 'button';
    home.addEventListener('click', () => this.store.reset());
    wrap.append(home);

    this.el.append(wrap);
  }
}
