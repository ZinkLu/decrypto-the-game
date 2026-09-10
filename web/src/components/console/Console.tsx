import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ConsoleEngine } from './engine';
import { initialLocal, previewState, roleState, rosterTeams, archiveRows, nextScopeMode, nextScopeValue, scopeModes, scopeRates, scopePersistenceModes } from './model';
import { paint } from './paint';
import ArchiveSheet from './ArchiveSheet';
import { notesKey } from './notebook';
import type { PaperOrigin } from './mechanics';
import type { LocalState } from './model';
import type { Target } from './paint';
const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') : null;
const scopeControls = ['scope-tune', 'scope-rate', 'scope-persist', 'meter-amplitude', 'meter-rate'];
const isScopeControl = (id: string) => scopeControls.includes(id);
const scopeStepId = (id: string, forward: boolean) => forward ? id : id === 'scope-tune' ? 'scope-prev' : id + '-prev';
export default function Console() {
    const live = useGameStore();
    const s = useMemo(() => preview ? previewState(live, preview) : live, [live]);
    const [u, setU] = useState<LocalState>({ ...initialLocal, seconds: 90 });
    const [loaded, setLoaded] = useState(false);
    const [failure, setFailure] = useState('');
    const [archiveVisible, setArchiveVisible] = useState(false);
    const [archiveOrigin, setArchiveOrigin] = useState<PaperOrigin>();
    const stage = useRef<HTMLDivElement>(null);
    const engine = useRef<ConsoleEngine | null>(null);
    const controls = useRef(new Map<string, HTMLElement>());
    const content = useMemo(() => paint(s, u), [s, u]);
    const current = useRef({ s, u, content });
    current.current = { s, u, content };
    const pending = useRef(false);
    const progressLast = useRef(0);
    const tuningDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressTuningClick = useRef(false);
    const pullDrag = useRef<{ y: number; moved: boolean } | null>(null);
    const suppressPullClick = useRef(false);
    const wheelLast = useRef(0);
    const [hint, setHint] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const viewKey = `${s.phase}:${s.round}:${s.myRole}`;
    function patch(values: Partial<LocalState>) { setU(old => ({ ...old, ...values })); }
    function closeArchive() { setArchiveVisible(false); patch({ archiveOpen: false }); }
    function project() {
        const e = engine.current;
        if (!e)
            return;
        for (const target of current.current.content.targets) {
            const node = controls.current.get(target.surface + ':' + target.id);
            const bounds = e.bounds(target);
            if (node && !failure) node.style.visibility = bounds ? 'visible' : 'hidden';
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
            instance = new ConsoleEngine(stage.current!, project, setFailure, origin => {
                if (!cancelled && current.current.u.archiveOpen) {
                    setArchiveOrigin(origin); setArchiveVisible(true);
                    setAnnouncement('密报档案已抽出，可以查阅回合记录和私人笔记');
                }
            });
            engine.current = instance;
            instance.load().then(() => { if (!cancelled) {
                instance!.update(current.current.content, current.current.u);
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
    useLayoutEffect(() => { engine.current?.update(content, u); project(); }, [content, loaded]);
    useEffect(() => {
        pending.current = false;
        setU(old => ({ ...old, clues: ['', '', ''], guess: [0, 0, 0], slot: 0, submitted: false, focus: '', note: '', manual: false,
            rosterOpen: false, seconds: preview ? 45 : s.phase === 'encrypting' ? 90 : 60 }));
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
            if (document.querySelector('.archive-dialog[open]')) return;
            if (current.current.u.archiveOpen) {
                if (event.key === 'Escape') closeArchive();
                return;
            }
            if (event.key === 'Escape') {
                if (current.current.u.backView) act('flip-console');
                else if (current.current.u.rosterOpen) act('roster-toggle');
                else patch({ archiveOpen: false, manual: false, rosterOpen: false });
                return;
            }
            if (current.current.u.backView || current.current.u.rosterOpen || current.current.u.manual) return;
            const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable);
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
        if (id === 'flip-console') {
            patch({ backView: !local.backView, batteryOpen: false, focus: '' });
            document.querySelector<HTMLButtonElement>('.station-flip')?.focus();
            setHint('');
            setAnnouncement(local.backView ? '已回到操作面，所有输入仍然保留' : '已翻到检修面。可以打开电池仓、试听喇叭或做灯光自检。对局继续进行。');
            void engine.current?.soundFeedback();
            return;
        }
        if (id === 'battery-toggle') {
            patch({ batteryOpen: !local.batteryOpen });
            setAnnouncement(local.batteryOpen ? '电池仓已合上' : '电池仓已打开，四节电池与金属触点可见。再次点击电池仓合上。');
            void engine.current?.soundFeedback();
            return;
        }
        if (id.startsWith('battery-cell-')) {
            if (!local.backView || !local.batteryOpen) return;
            const index = Number(id.slice(-1));
            const removedBatteries = local.removedBatteries ^ (1 << index);
            patch({ removedBatteries });
            setAnnouncement(`第 ${index + 1} 节电池已${removedBatteries & (1 << index) ? '取出，再次点击装回' : '装回'}`);
            return;
        }
        if (id.startsWith('cable-plug-')) {
            if (!local.backView) return;
            const index = Number(id.slice(-1));
            patch({ unpluggedCables: local.unpluggedCables ^ (1 << index) });
            setAnnouncement(`${['网线', '串口线', '电源线'][index]}已${local.unpluggedCables & (1 << index) ? '插回' : '拔出'}。仅为机械演示。`);
            return;
        }
        if (id === 'sound-toggle') {
            patch({ soundOn: !local.soundOn });
            engine.current?.setSound(!local.soundOn);
            setAnnouncement(local.soundOn ? '机械音效已关闭' : '机械音效已开启，已播放喇叭试听音');
            return;
        }
        if (id === 'lamp-test') {
            engine.current?.testLamps();
            setAnnouncement('本机指示灯自检中，未改变对局或网络连接');
            return;
        }
        if (local.backView) return;
        if (id.startsWith('meter-amplitude') || id.startsWith('meter-rate')) {
            const field = id.startsWith('meter-amplitude') ? 'meterAmplitude' : 'meterRate';
            patch({ [field]: (local[field] + (id.endsWith('-prev') ? 4 : 1)) % 5 });
            return;
        }
        if (id.startsWith('scope-') || ['disk-toggle', 'transmit'].includes(id) || id.startsWith('key-'))
            void engine.current?.soundFeedback();
        if (id === 'manual') {
            patch({ manual: !local.manual, rosterOpen: false });
            void engine.current?.soundFeedback();
            return;
        }
        if (id === 'roster-toggle') {
            patch({ rosterOpen: !local.rosterOpen, manual: false, focus: '' });
            setHint('');
            setAnnouncement(local.rosterOpen ? '已返回操作，输入仍然保留' : '中央屏幕已展开队员名册，按 Escape 返回操作');
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
        if (id === 'archive-toggle') {
            setHint('');
            if (local.archiveOpen) return;
            patch({ archiveOpen: true });
            setAnnouncement('正在抽出密报档案');
            void engine.current?.soundFeedback();
            if (failure || !engine.current) setArchiveVisible(true);
            return;
        }
        if (id === 'disk-toggle') {
            patch({ diskOut: !local.diskOut });
            setAnnouncement(local.diskOut ? '软盘已插入' : '软盘已弹出，再次点击插入');
            return;
        }
        if (id === 'scope-tune' || id === 'scope-prev') {
            const mode = nextScopeMode(local.scopeMode, id === 'scope-prev' ? -1 : 1);
            patch({ scopeMode: mode });
            setAnnouncement('示波器已切换到' + scopeModes[mode]);
            return;
        }
        if (id === 'scope-rate' || id === 'scope-rate-prev') {
            const rate = nextScopeValue(local.scopeRate, scopeRates.length, id.endsWith('-prev') ? -1 : 1);
            patch({ scopeRate: rate });
            setAnnouncement('示波器扫描速率' + scopeRates[rate]);
            return;
        }
        if (id === 'scope-persist' || id === 'scope-persist-prev') {
            const persistence = nextScopeValue(local.scopePersistence, scopePersistenceModes.length, id.endsWith('-prev') ? -1 : 1);
            patch({ scopePersistence: persistence });
            setAnnouncement('示波器' + scopePersistenceModes[persistence]);
            return;
        }
        if (id === 'copy-code') {
            engine.current?.pulse('copy-code');
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
            if (!r.guess || !r.active || !state.connected || local.rosterOpen || local.manual)
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
    <div className="station-viewport" inert={u.archiveOpen}>
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
                'aria-label': target.label, 'data-control': target.id, 'data-surface': target.surface,
                disabled: target.disabled,
                style: failure ? { visibility: 'visible' as const } : undefined,
                title: target.label,
                'aria-expanded': target.id === 'archive-toggle' ? u.archiveOpen : target.id === 'battery-toggle' ? u.batteryOpen : target.id === 'roster-toggle' ? u.rosterOpen : undefined,
                'aria-haspopup': target.id === 'archive-toggle' ? 'dialog' as const : undefined,
                'aria-pressed': target.id === 'disk-toggle' ? u.diskOut : target.id === 'sound-toggle' ? u.soundOn : target.id === 'manual' ? u.manual : undefined,
                onMouseEnter: () => setHint(target.id),
                onMouseLeave: () => setHint(''),
                onFocus: () => { setHint(target.id); patch({ focus: target.id }); if (target.id.startsWith('clue-'))
                    progress(u.clues, u.guess, Number(target.id.slice(5)), true); },
                onBlur: () => { setHint(''); if (current.current.u.focus === target.id)
                    patch({ focus: '' }); },
            };
            return target.kind === 'input' ? <input key={key} {...common} type="text" value={target.value || ''} maxLength={target.maxLength} placeholder={target.label} autoComplete={target.id === 'name' ? 'nickname' : 'off'} spellCheck={false} onChange={e => change(target, e.target.value)} onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.id.startsWith('clue-')) {
                        e.preventDefault();
                        const i = Number(target.id.slice(5));
                        controls.current.get(`screen:clue-${Math.min(i + 1, 2)}`)?.focus();
                    }
                }}/> : <button key={key} {...common} onClick={e => {
                    if (isScopeControl(target.id) && suppressTuningClick.current && e.detail > 0) { suppressTuningClick.current = false; return; }
                    if (target.surface === 'paper' && suppressPullClick.current && e.detail > 0) { suppressPullClick.current = false; return; }
                    act(target.id);
                }} onPointerDown={isScopeControl(target.id) ? e => {
                    suppressTuningClick.current = false;
                    tuningDrag.current = { x: e.clientX, y: e.clientY, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                } : target.surface === 'paper' ? e => {
                    suppressPullClick.current = false;
                    pullDrag.current = { y: e.clientY, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                } : undefined} onPointerMove={isScopeControl(target.id) ? e => {
                    const drag = tuningDrag.current;
                    if (!drag) return;
                    const delta = e.clientX - drag.x - (e.clientY - drag.y);
                    if (Math.abs(delta) >= 22) {
                        act(scopeStepId(target.id, delta > 0));
                        tuningDrag.current = { x: e.clientX, y: e.clientY, moved: true };
                    }
                } : target.surface === 'paper' ? e => {
                    if (pullDrag.current && e.clientY - pullDrag.current.y > 16) pullDrag.current.moved = true;
                } : undefined} onPointerUp={isScopeControl(target.id) ? () => {
                    suppressTuningClick.current = !!tuningDrag.current?.moved;
                    tuningDrag.current = null;
                } : target.surface === 'paper' ? () => {
                    suppressPullClick.current = !!pullDrag.current?.moved;
                    if (pullDrag.current?.moved) act(target.id);
                    pullDrag.current = null;
                } : undefined} onPointerCancel={() => { tuningDrag.current = null; suppressTuningClick.current = false; pullDrag.current = null; suppressPullClick.current = false; }}
                onKeyDown={isScopeControl(target.id) ? e => {
                    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
                        e.preventDefault(); act(scopeStepId(target.id, !['ArrowDown', 'ArrowLeft'].includes(e.key)));
                    }
                } : undefined} onWheel={isScopeControl(target.id) ? e => {
                    if (Math.abs(e.deltaY) > 3 && performance.now() - wheelLast.current > 120) {
                        wheelLast.current = performance.now(); act(scopeStepId(target.id, e.deltaY > 0));
                    }
                } : undefined}>
                {target.label}
              </button>;
        })}
        </div>
        <section className={failure ? 'fallback-readout' : 'sr-only'} aria-label="当前通信文字记录"><h2>当前通信</h2><p>{content.status}</p><p>{u.hiddenWords ? '秘密词已遮住' : s.myWords.join(' · ')}</p><p>{s.clues.join(' / ')}</p>
          <p>第 {s.round} 回合，加密者：{s.encryptor}。{roleState(s, u).encrypt ? `本轮私密密码：${s.secretDigits.join('、')}` : ''}</p>
          <p>A 队截获 {s.scoreA.interceptions} 次、失误 {s.scoreA.decrypt_failures} 次；B 队截获 {s.scoreB.interceptions} 次、失误 {s.scoreB.decrypt_failures} 次。</p>
          {rosterTeams(s, u).map(team => <section key={team.team} aria-label={`${team.team} 队名册`}>
            <h3>{team.team} 队{team.own ? ' · 我方' : ''} · {team.count} 人 · {team.summary}</h3>
            <ul>{team.seats.map(seat => <li key={seat.code}>{seat.code} · {seat.player ? `${seat.player.nickname}${seat.self && seat.player.nickname !== '你' ? ' · 你' : ''} · ${seat.player.is_ai ? 'AI' : '真人'}${seat.owner ? ' · 房主' : ''}` : '空席'} · {seat.status}{seat.progress ? ` · 已完成 ${seat.progress.step} / ${seat.progress.total}` : ''}</li>)}</ul>
          </section>)}
          {s.gameOver && <p>{s.gameOver.winner ? `${s.gameOver.winner} 队获胜` : '双方平局'}</p>}
          {archiveRows(s, 'all').map(row => <p key={row.round}>第 {row.round} 回合 · {row.team} 队：{row.clues.join(' / ')}；密码 {row.secret?.join(' · ') || '未公开'}</p>)}
        </section>
      </div>
    </div>
    {loaded && !failure && <div className="station-workbench" inert={u.archiveOpen}>
      {u.backView && <p className="station-rear-status" role="status">
        <span>检修面 · 对局仍在进行</span>
        {s.phase === 'home' ? '尚未接入频道' : s.phase === 'room' ? '队伍准备中' :
            `第 ${s.round} 回合 · ${s.phase === 'encrypting' ? '加密' : s.phase === 'intercept' ? '拦截' : s.phase === 'decrypt' ? '解码' : '阶段已更新'}${roleState(s,u).active ? ' · 轮到你了' : ''}`}
      </p>}
      <button className="station-flip" onClick={() => act('flip-console')} aria-pressed={u.backView}>
        <span aria-hidden="true">↶</span>{u.backView ? '回到操作面' : '翻到背面'}<small>{u.backView ? 'ESC' : '检修 / 探索'}</small>
      </button>
    </div>}
    {hint && !u.archiveOpen && <div className="station-hint" aria-hidden="true">{content.targets.find(target => target.id === hint)?.label}</div>}
    <p className="mobile-hint">横向滑动查看终端 · 点击纸带查看档案与笔记</p>
    <ArchiveSheet key={notesKey(s.roomCode, s.myPlayerID, !!preview)} storageKey={notesKey(s.roomCode, s.myPlayerID, !!preview)} open={archiveVisible} origin={archiveOrigin} state={s} onClose={closeArchive} onClosed={() => controls.current.get('paper:archive-toggle')?.focus()}/>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </main>;
}
