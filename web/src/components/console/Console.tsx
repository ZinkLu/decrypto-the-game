import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ConsoleEngine } from './engine';
import { initialLocal, previewState, roleState, archiveRows, archiveStart } from './model';
import { paint } from './paint';
import type { LocalState } from './model';
import type { Target } from './paint';
const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') : null;
export default function Console() {
    const live = useGameStore();
    const s = useMemo(() => preview ? previewState(live, preview) : live, [live]);
    const [u, setU] = useState<LocalState>({ ...initialLocal, seconds: 90 });
    const [loaded, setLoaded] = useState(false);
    const [failure, setFailure] = useState('');
    const stage = useRef<HTMLDivElement>(null);
    const engine = useRef<ConsoleEngine | null>(null);
    const controls = useRef(new Map<string, HTMLElement>());
    const content = useMemo(() => paint(s, u), [s, u]);
    const current = useRef({ s, u, content });
    current.current = { s, u, content };
    const pending = useRef(false);
    const progressLast = useRef(0);
    const [announcement, setAnnouncement] = useState('');
    const viewKey = `${s.phase}:${s.round}:${s.myRole}`;
    function patch(values: Partial<LocalState>) { setU(old => ({ ...old, ...values })); }
    function project() {
        const e = engine.current;
        if (!e)
            return;
        for (const target of current.current.content.targets) {
            const node = controls.current.get(target.surface + ':' + target.id);
            const bounds = e.bounds(target);
            if (node && bounds) {
                Object.assign(node.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
                if (target.kind === 'input')
                    node.style.fontSize = Math.max(12, bounds.height * .36) + 'px';
            }
        }
    }
    useEffect(() => {
        if (!preview)
            live.connect();
        return () => { if (!preview)
            useGameStore.getState().disconnect(); };
    }, []);
    useEffect(() => {
        let cancelled = false;
        let instance: ConsoleEngine | undefined;
        try {
            instance = new ConsoleEngine(stage.current!, project, setFailure);
            engine.current = instance;
            instance.load().then(() => { if (!cancelled) {
                instance!.update(current.current.content, current.current.u.archiveOpen);
                setLoaded(true);
            } })
                .catch(() => { if (!cancelled)
                setFailure('终端模型未能载入。请刷新重试，或使用下方文字控件继续。'); });
        }
        catch {
            setFailure('此设备无法启动 3D 图形。你仍可使用文字控件完成游戏。');
        }
        return () => { cancelled = true; instance?.dispose(); engine.current = null; };
    }, []);
    useLayoutEffect(() => { engine.current?.update(content, u.archiveOpen); project(); }, [content, u.archiveOpen, loaded]);
    useEffect(() => {
        pending.current = false;
        setU(old => ({ ...old, clues: ['', '', ''], guess: [0, 0, 0], slot: 0, submitted: false, focus: '', note: '', manual: false,
            seconds: preview ? 45 : s.phase === 'encrypting' ? 90 : 60 }));
        setAnnouncement(s.phase === 'home' ? '通信终端已就绪' : `第 ${s.round} 回合，${s.phase === 'encrypting' ? '加密' : s.phase === 'intercept' ? '拦截' : s.phase === 'decrypt' ? '解码' : s.phase === 'room' ? '队伍准备' : '阶段更新'}`);
        if (preview || ['home', 'room', 'round_result', 'game_over'].includes(s.phase)) return;
        const deadline = Date.now() + (s.phase === 'encrypting' ? 90 : 60) * 1000;
        const timer = window.setInterval(() => setU(old => ({ ...old, seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) })), 1000);
        return () => clearInterval(timer);
    }, [viewKey]);
    useEffect(() => { if (s.error) {
        pending.current = false;
        patch({ submitted: false });
        setAnnouncement(s.error);
    } }, [s.error]);
    useEffect(() => { pending.current = false; }, [s.teamA, s.teamB, s.roomCode]);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.isComposing)
                return;
            if (event.key === 'Escape') {
                patch({ archiveOpen: false, manual: false });
                return;
            }
            const input = event.target instanceof HTMLInputElement;
            if (!input && /^[1-4]$/.test(event.key)) {
                event.preventDefault();
                act('key-' + (Number(event.key) - 1));
            }
            if (!input && event.key === 'Backspace') {
                event.preventDefault();
                act('key-4');
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                act('transmit');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });
    function progress(clues: string[], guess: number[], slot: number, force = false) {
        const now = performance.now();
        if (!force && now - progressLast.current < 180)
            return;
        progressLast.current = now;
        const state = current.current.s;
        const local = current.current.u;
        const r = roleState(state, local);
        if (preview || !r.active || !state.connected)
            return;
        state.sendProgress(r.action, r.encrypt ? clues.filter(c => c.trim()).length : guess.filter(Boolean).length, { state: 'editing', focus: slot + 1, ...(r.guess ? { guesses: guess } : {}) });
    }
    function change(target: Target, value: string) {
        const local = current.current.u;
        if (target.id === 'name')
            patch({ name: value });
        else if (target.id === 'code')
            patch({ code: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) });
        else if (target.id.startsWith('clue-')) {
            const index = Number(target.id.slice(5));
            const clues = [...local.clues];
            clues[index] = value;
            patch({ clues });
            progress(clues, local.guess, index);
        }
    }
    function act(id: string) {
        const { s: state, u: local } = current.current;
        const r = roleState(state, local);
        if (id === 'manual') {
            patch({ manual: !local.manual });
            return;
        }
        if (id === 'words') {
            patch({ hiddenWords: !local.hiddenWords });
            return;
        }
        if (id.startsWith('mode-')) {
            patch({ mode: id === 'mode-join' ? 'join' : 'create', note: '' });
            pending.current = false;
            return;
        }
        if (id === 'archive-toggle' || id === 'archive-close') {
            patch({ archiveOpen: !local.archiveOpen });
            return;
        }
        if (id.startsWith('filter-')) {
            patch({ archiveTeam: id.slice(7), archivePage: 0, archiveAnchor: null });
            return;
        }
        if (id.startsWith('archive-')) {
            const rows = archiveRows(state, local.archiveTeam);
            const start = archiveStart(state, local);
            const next = id === 'archive-latest' ? 0 : Math.max(0, Math.min(rows.length - 1, start + (id === 'archive-next' ? 2 : -2)));
            patch({ archivePage: Math.floor(next / 2), archiveAnchor: next > 0 ? rows[next]?.round ?? null : null });
            engine.current?.pulse('archive');
            return;
        }
        if (id === 'copy-code') {
            if (state.roomCode)
                navigator.clipboard.writeText(state.roomCode).then(() => patch({ note: '频道编号已复制。' })).catch(() => patch({ note: `频道编号：${state.roomCode}` }));
            return;
        }
        if (id.startsWith('slot-')) {
            if (r.active)
                patch({ slot: Number(id.slice(5)) });
            return;
        }
        if (id.startsWith('key-')) {
            if (!r.guess || !r.active || !state.connected)
                return;
            const n = Number(id.slice(4));
            const guess = [...local.guess];
            let slot = local.slot;
            if (n === 4) {
                if (!guess[slot] && slot > 0)
                    slot--;
                guess[slot] = 0;
            }
            else {
                if (guess.some((v, i) => v === n + 1 && i !== slot)) {
                    patch({ note: '三个密码编号不能重复。' });
                    return;
                }
                guess[slot] = n + 1;
                slot = Math.min(2, slot + 1);
            }
            patch({ guess, slot, note: '' });
            progress(local.clues, guess, slot, true);
            engine.current?.pulse(id);
            return;
        }
        if (!state.connected || pending.current)
            return;
        if (preview) {
            if (id === 'transmit' && current.current.content.ready) {
                engine.current?.pulse(id);
                patch({ submitted: true, note: '外观预览：提交反馈已演示。实际联机请移除 preview 参数。' });
            }
            return;
        }
        if (id === 'transmit') {
            if (!current.current.content.ready)
                return;
            engine.current?.pulse(id);
            state.clearError();
            pending.current = true;
            if (state.phase === 'home') {
                patch({ note: '正在接入频道…' });
                local.mode === 'create' ? state.createRoom(local.name.trim()) : state.joinRoom(local.code, local.name.trim());
            }
            else if (state.phase === 'room') {
                patch({ note: '正在启动终端…' });
                state.startGame();
            }
            else if (state.phase === 'game_over') {
                state.reset();
                state.connect();
            }
            else if (r.ready) {
                patch({ submitted: true, note: '' });
                state.sendProgress(r.action, 3, { state: 'submitted', ...(r.guess ? { guesses: local.guess } : {}) });
                if (r.encrypt)
                    state.submitClues(local.clues.map(c => c.trim()) as [
                        string,
                        string,
                        string
                    ]);
                else if (state.phase === 'intercept')
                    state.submitIntercept(local.guess as [
                        number,
                        number,
                        number
                    ]);
                else
                    state.submitDecrypt(local.guess as [
                        number,
                        number,
                        number
                    ]);
            }
        }
        else if (id.startsWith('team-')) {
            const team = id.slice(5);
            const people = team === 'A' ? state.teamA : state.teamB;
            people.some(p => p.id === state.myPlayerID) ? state.leaveTeam() : state.selectTeam(team);
        }
        else if (id.startsWith('ai-'))
            state.addAI(id.slice(3));
        else if (id.startsWith('remove-')) {
            const [, team, index] = id.split('-');
            state.removeAI(team, Number(index));
        }
    }
    return <main className={`station ${failure ? 'station-fallback' : ''}`}>
    <h1 className="sr-only">Decrypto 谍报风云 · 密码通信终端</h1>
    <div className="station-viewport">
      <div className="station-stage" ref={stage}>
        {!loaded && !failure && <div className="station-loading"><strong>DECRYPTO</strong><span>正在启动密码终端…</span></div>}
        {failure && <div className="station-error" role="alert">{failure}<button onClick={() => location.reload()}>重新载入</button></div>}
        <div className="station-controls" aria-label="密码通信终端控件" style={{ visibility: loaded || failure ? 'visible' : 'hidden' }}>
          {content.targets.map(target => {
            const key = target.surface + ':' + target.id;
            const common = {
                ref: (el: HTMLElement | null) => { if (el)
                    controls.current.set(key, el);
                else
                    controls.current.delete(key); },
                'aria-label': target.label, 'data-control': target.id,
                disabled: target.disabled,
                onFocus: () => { patch({ focus: target.id }); if (target.id.startsWith('clue-'))
                    progress(u.clues, u.guess, Number(target.id.slice(5)), true); },
                onBlur: () => { if (current.current.u.focus === target.id)
                    patch({ focus: '' }); },
            };
            return target.kind === 'input' ? <input key={key} {...common} type="text" value={target.value || ''} maxLength={target.maxLength} placeholder={target.label} autoComplete={target.id === 'name' ? 'nickname' : 'off'} spellCheck={false} onChange={e => change(target, e.target.value)} onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.id.startsWith('clue-')) {
                        e.preventDefault();
                        const i = Number(target.id.slice(5));
                        controls.current.get(`screen:clue-${Math.min(i + 1, 2)}`)?.focus();
                    }
                }}/> : <button key={key} {...common} onClick={() => act(target.id)} onWheel={target.surface === 'paper' || target.surface === 'wheel' ? e => { if (Math.abs(e.deltaY) > 3)
                act(e.deltaY > 0 ? 'archive-next' : 'archive-prev'); } : undefined}>
                {target.label}
              </button>;
        })}
        </div>
        <section className={failure ? 'fallback-readout' : 'sr-only'} aria-label="当前通信文字记录"><h2>当前通信</h2><p>{content.status}</p><p>{u.hiddenWords ? '秘密词已遮住' : s.myWords.join(' · ')}</p><p>{s.clues.join(' / ')}</p>
          <p>第 {s.round} 回合，加密者：{s.encryptor}。{roleState(s, u).encrypt ? `本轮私密密码：${s.secretDigits.join('、')}` : ''}</p>
          <p>A 队截获 {s.scoreA.interceptions} 次、失误 {s.scoreA.decrypt_failures} 次；B 队截获 {s.scoreB.interceptions} 次、失误 {s.scoreB.decrypt_failures} 次。</p>
          {s.gameOver && <p>{s.gameOver.winner ? `${s.gameOver.winner} 队获胜` : '双方平局'}</p>}
          {archiveRows(s, 'all').map(row => <p key={row.round}>第 {row.round} 回合 · {row.team} 队：{row.clues.join(' / ')}；密码 {row.secret?.join(' · ') || '未公开'}</p>)}
        </section>
      </div>
    </div>
    <p className="mobile-hint">横向滑动查看整台终端 · 点击纸带放大记录</p>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </main>;
}
