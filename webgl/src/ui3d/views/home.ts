// Home view: brand, one-line brief, create/join tabs, callsign + channel
// code fields, connection status — all painted on the main CRT.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { button, inputField, makeArea, tabBar, text, measure } from '../kit';
import { T, font } from '../theme';
import { ime } from '../ime';
import { CView, caretOn } from '../view';

const CX = 368; // left edge of the centered 800px column
const CW = 800;

export class HomeView extends CView {
  readonly id = 'home';
  private nick = window.localStorage.getItem('decrypto-nick') ?? '';
  private code = '';
  private tab: 'create' | 'join' = 'create';
  private focus: 'nick' | 'code' | null = null;

  get animated(): boolean {
    return this.focus !== null; // caret blink
  }

  private setFocus(f: 'nick' | 'code' | null): void {
    this.focus = f;
    if (f === null) {
      ime.detach();
      return;
    }
    const view = this;
    ime.attach({
      get: () => (f === 'nick' ? view.nick : view.code),
      set: (v) => {
        if (f === 'nick') view.nick = v.slice(0, 16);
        else view.code = v.slice(0, 8).toUpperCase();
      },
      onCommit: () => {
        if (f === 'nick') {
          if (view.tab === 'create') view.submit();
          else view.setFocus('code');
        } else {
          view.submit();
        }
      },
      onKey: (ev) => {
        if (ev.key === 'Tab') {
          ev.preventDefault?.();
          if (view.tab === 'join' && f === 'nick') view.setFocus('code');
          else view.setFocus('nick');
          return true;
        }
        if (ev.key === 'Escape') {
          view.setFocus(null);
          return true;
        }
        return false;
      },
    });
  }

  private submit(): void {
    const nick = this.nick.trim();
    if (!nick) {
      this.store.showToast('请先输入代号');
      this.setFocus('nick');
      return;
    }
    window.localStorage.setItem('decrypto-nick', nick);
    if (this.tab === 'create') {
      this.store.createRoom(nick);
      return;
    }
    const code = this.code.trim().toUpperCase();
    if (!code) {
      this.store.showToast('请填写频道代码');
      this.setFocus('code');
      return;
    }
    this.store.joinRoom(code, nick);
  }

  leave(): void {
    this.setFocus(null);
  }

  key(ev: KeyboardEvent): boolean {
    if (ev.key === 'Enter') {
      this.submit();
      return true;
    }
    return false;
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    // brand
    text(g, 'T O P   S E C R E T · 机 密', 768, 148, { size: 16, weight: 700, color: T.red, align: 'center' });
    g.save();
    g.shadowColor = 'rgba(255,180,94,0.4)';
    g.shadowBlur = 24;
    text(g, '谍报风云', 768, 216, { size: 62, weight: 800, color: T.amber, align: 'center' });
    g.restore();
    text(g, 'D E C R Y P T O · 冷战密码战', 768, 258, { size: 16, color: T.dim, align: 'center' });

    // brief
    line(g, CX, 292, CX + CW);
    text(g, '用线索传递密码：让队友听懂，让敌人迷路。', CX, 330, { size: 21, color: T.text });
    text(g, '4–8 人 · 约 30 分钟 · 人手不足可 AI 补位', CX, 366, { size: 17, color: T.dim });
    const howto = makeArea('howto', CX + CW - 130, 342, 130, 40, () =>
      window.dispatchEvent(new CustomEvent('decrypto:howto')),
    );
    this.areas.push(howto);
    miniBtn(g, howto, '怎么玩？');
    line(g, CX, 396, CX + CW);

    // create / join tabs
    tabBar(
      g,
      this.areas,
      CX,
      424,
      CW,
      56,
      [
        { id: 'create', label: '新建行动' },
        { id: 'join', label: '应召加入' },
      ],
      this.tab,
      (id) => {
        this.tab = id as 'create' | 'join';
        this.setFocus(this.tab === 'join' ? 'code' : 'nick');
      },
    );

    // callsign field
    const nickArea = makeArea('nick', CX, 524, CW, 56, () => this.setFocus('nick'));
    this.areas.push(nickArea);
    inputField(g, nickArea, this.nick, {
      label: '你的代号（其他玩家看到的名字）',
      placeholder: '夜莺',
      focused: this.focus === 'nick',
      caretOn: caretOn(t),
    });

    let submitY = 628;
    if (this.tab === 'join') {
      const codeArea = makeArea('code', CX, 628, CW, 56, () => this.setFocus('code'));
      this.areas.push(codeArea);
      inputField(g, codeArea, this.code, {
        label: '频道代码（朋友分享给你的）',
        placeholder: '例如 X7K2',
        focused: this.focus === 'code',
        caretOn: caretOn(t),
        mono: true,
      });
      submitY = 732;
    }

    const submit = makeArea('submit', CX, submitY, CW, 64, () => this.submit());
    submit.enabled = s.connected;
    this.areas.push(submit);
    button(g, submit, this.tab === 'create' ? '创建新频道' : '加入频道', {
      primary: true,
      enabled: s.connected,
      size: 24,
    });

    if (s.notice) {
      text(g, s.notice, CX, submitY + 104, { size: 17, color: T.red });
    }

    // connection status
    const on = s.connected;
    g.beginPath();
    g.arc(768 - measure(g, on ? '线路已接通' : '线路中断 · 重连中…', 17) / 2 - 18, 884, 6, 0, Math.PI * 2);
    g.fillStyle = on ? '#61c08a' : T.red;
    g.fill();
    text(g, on ? '线路已接通' : '线路中断 · 重连中…', 768, 890, { size: 17, color: T.dim, align: 'center' });
  }
}

function line(g: Ctx, x1: number, y: number, x2: number): void {
  g.strokeStyle = T.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x1, y);
  g.lineTo(x2, y);
  g.stroke();
}

function miniBtn(g: Ctx, a: ReturnType<typeof makeArea>, label: string): void {
  g.fillStyle = a.hovered ? 'rgba(255,180,94,0.18)' : 'transparent';
  g.strokeStyle = T.amberDim;
  g.lineWidth = 1;
  g.strokeRect(a.x, a.y, a.w, a.h);
  g.fillRect(a.x, a.y, a.w, a.h);
  g.font = font(17, 400);
  g.fillStyle = T.amber;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, a.x + a.w / 2, a.y + a.h / 2);
}
