import { translate, localizeError, readLocale, saveLocale } from './i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ConsoleEngine } from './engine';
import { initialLocal, previewState, roleState, rosterTeams, archiveRows, nextScopeMode, instrumentSteps, word, instrumentOptions, stepInstrumentValue } from './model';
import { paint, knobLabel } from './paint';
import ArchiveSheet from './ArchiveSheet';
import MobileConsole from './MobileConsole';
import type { LocalState, InstrumentVariant } from './model';
import type { Target } from './paint';
import type { PlayerInfo } from '../../store/gameStore';
const instrumentPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('instruments');
const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') || (instrumentPreview ? 'encrypting' : null) : null;
const detail = import.meta.env.DEV ? new URLSearchParams(location.search).get('detail') : null;
const initialInstrument = instrumentPreview ? instrumentOptions.find(option => option.id === new URLSearchParams(location.search).get('instruments'))?.id || 'signal' : initialLocal.instrumentVariant;
const scopeControls = ['scope-tune', 'scope-rate', 'scope-xy', 'meter-amplitude', 'meter-rate'];
const isScopeControl = (id: string) => scopeControls.includes(id);
export default function Console() {
    const live = useGameStore();
    const [u, setU] = useState<LocalState>({ ...initialLocal, locale: readLocale(), seconds: 90, instrumentVariant: initialInstrument, instrumentDemo: initialInstrument === 'signal',
        meterAmplitude: initialInstrument === 'signal' ? 14 : initialInstrument === 'tuning' ? 4 : initialInstrument === 'status' ? 0 : 2 });
    const [previewPeople, setPreviewPeople] = useState<PlayerInfo[]>([{ id: '0', nickname: '你', is_ai: false }]);
    const previewSerial = useRef(1);
    const s = useMemo(() => {
        if (preview !== 'roster-motion') return preview ? previewState(live, preview, u.locale) : live;
        const state = previewState(live, 'room-partial', u.locale);
        return { ...state, teamA: previewPeople, players: [...previewPeople, ...state.teamB],
            canStart: previewPeople.length >= 2 };
    }, [live, previewPeople, u.locale]);
    const [instrumentCloseup, setInstrumentCloseup] = useState(detail === 'meter');
    const [loaded, setLoaded] = useState(false);
    const [failure, setFailure] = useState('');
    const [archiveVisible, setArchiveVisible] = useState(false);
    const stage = useRef<HTMLDivElement>(null);
    const engine = useRef<ConsoleEngine | null>(null);
    const controls = useRef(new Map<string, HTMLElement>());
    // Analog input updates targets and hardware, without repainting all the
    // game screens and the long receipt for each fraction of a knob turn.
    const paintKey = JSON.stringify({ ...u, scopeFreq: 0, scopeRate: 0, scopeAxis: 0, meterAmplitude: 0, meterRate: 0 });
    const painted = useMemo(() => paint(s, u), [s, paintKey]);
    const content = useMemo(() => ({ ...painted, targets: painted.targets.map(target =>
        isScopeControl(target.id) ? { ...target, label: knobLabel(target.id, u) } : target) }),
        [painted, u.scopeFreq, u.scopeRate, u.scopeAxis, u.meterAmplitude, u.meterRate]);
    const current = useRef({ s, u, content });
    current.current = { s, u, content };
    const pending = useRef(false);
    const progressLast = useRef(0);
    const tuningDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressTuningClick = useRef(false);
    const pullDrag = useRef<{ y: number; moved: boolean } | null>(null);
    const suppressPullClick = useRef(false);
    const archiveFocusPending = useRef(false);
    const [hint, setHint] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const viewKey = `${s.phase}:${s.round}:${s.myRole}`;
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    useEffect(() => { saveLocale(u.locale); document.documentElement.lang = u.locale === 'zh' ? 'zh-CN' : 'en'; document.title = u.locale === 'zh' ? 'Decrypto - 谍报风云' : 'Decrypto'; setAnnouncement(translate(u.locale, '语言已切换'));  }, [u.locale]);
    function patch(values: Partial<LocalState>) { setU(old => ({ ...old, ...values })); }
    function adjustInstrument(control: 'amplitude' | 'rate', steps: number) {
        const local = current.current.u;
        if (!local.powerOn || local.backView) return;
        const field = control === 'amplitude' ? 'meterAmplitude' : 'meterRate';
        patch({ [field]: stepInstrumentValue(local.instrumentVariant, control, local[field], steps),
            instrumentDemo: local.instrumentVariant === 'signal' && control === 'rate' ? local.instrumentDemo : false });
    }
    // Pointer and wheel input turn a knob continuously; clicks and keys move it
    // in notches. FREQ sits behind a vernier drive, and its notches are quarters
    // of the spacing between engraved marks, so keys still land on every mark.
    function adjustKnob(id: string, delta: number, notches = false) {
        const local = current.current.u;
        if (!local.powerOn || local.backView) return;
        const vernier = id === 'scope-tune';
        const turn = notches ? delta * (vernier ? 1 / 28 : .025) : vernier ? delta * .45 : delta;
        if (id.startsWith('meter-')) {
            const control = id === 'meter-amplitude' ? 'amplitude' : 'rate';
            adjustInstrument(control, turn * (instrumentSteps(local.instrumentVariant, control) - 1));
            return;
        }
        const field = vernier ? 'scopeFreq' : id === 'scope-rate' ? 'scopeRate' : 'scopeAxis';
        setU(old => ({ ...old, [field]: Math.max(0, Math.min(1, old[field] + turn)) }));
    }
    function selectInstrument(variant: InstrumentVariant) {
        patch({ instrumentVariant: variant, meterAmplitude: variant === 'signal' ? 14 : variant === 'tuning' ? 4 : variant === 'status' ? 0 : 2,
            meterRate: 2, instrumentDemo: false });
        const url = new URL(location.href);
        url.searchParams.set('instruments', variant);
        history.replaceState(null, '', url);
        setHint('');
        setAnnouncement(t("已试装{0}", [t(instrumentOptions.find(option => option.id === variant)?.label || '')]));
    }
    function inspectInstrument(closeup: boolean) {
        setInstrumentCloseup(closeup);
        engine.current?.inspectInstrument(closeup);
        const url = new URL(location.href);
        if (closeup) url.searchParams.set('detail', 'meter'); else url.searchParams.delete('detail');
        history.replaceState(null, '', url);
    }
    function previewRoster(action: 'human' | 'ai' | 'remove' | 'replace') {
        if (preview !== 'roster-motion') return;
        const serial = previewSerial.current++;
        const player = { id: `preview-${serial}`, nickname: action === 'human' ? `夜航员 ${serial}` : `AI · ${String(serial).padStart(2, '0')}`, is_ai: action !== 'human' };
        setPreviewPeople(people => action === 'remove' ? people.slice(0, -1) :
            action === 'replace' ? [...people.slice(0, -1), player] : [...people, player].slice(0, 4));
    }
    function closeArchive() {
        archiveFocusPending.current = true;
        setAnnouncement(archiveVisible ? t("正在收起记录并撕下小票") : t("已取消打开记录"));
        setArchiveVisible(false);
        patch({ archiveOpen: false });
        if (archiveVisible) void engine.current?.soundFeedback();
    }
    function restoreArchiveFocus() {
        if (!archiveFocusPending.current || current.current.u.archiveOpen || document.querySelector('.archive-dialog[open]')) return;
        archiveFocusPending.current = false;
        if (matchMedia('(max-width: 850px)').matches) document.querySelector<HTMLButtonElement>('[data-mobile-archive]')?.focus();
        else controls.current.get('paper:archive-toggle')?.focus();
    }
    useEffect(restoreArchiveFocus, [u.archiveOpen]);
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
            instance = new ConsoleEngine(stage.current!, project, setFailure, () => {
                if (!cancelled && current.current.u.archiveOpen) {
                    setArchiveVisible(true);
                    setAnnouncement(t("正在拉出纸带并展开密报记录；关闭后撕下小票"));
                }
            }, !!preview, instrumentPreview);
            engine.current = instance;
            instance.load().then(() => { if (!cancelled) {
                instance!.update(current.current.content, current.current.u);
                setLoaded(true);
            } })
                .catch(() => { if (!cancelled)
                setFailure(t("终端模型未能载入。请刷新重试，或使用下方文字控件继续。")); });
        }
        catch {
            setFailure(t("此设备无法启动 3D 图形。你仍可使用文字控件完成游戏。"));
        }
        return () => { cancelled = true; instance?.dispose(); engine.current = null; };
    }, []);
    useLayoutEffect(() => { engine.current?.update(content, u); project(); }, [content, loaded]);
    useEffect(() => {
        pending.current = false;
        setU(old => ({ ...old, clues: ['', '', ''], guess: [0, 0, 0], slot: 0, submitted: false, focus: '', note: '', manual: false,
            rosterOpen: false, seconds: preview ? 45 : s.phase === 'encrypting' ? 90 : 60 }));
        setAnnouncement(s.phase === 'home' ? t("通信终端已就绪") : t("第 {0} 回合，{1}", [s.round, s.phase === 'encrypting' ? t("加密") : s.phase === 'intercept' ? t("拦截") : s.phase === 'decrypt' ? t("解码") : s.phase === 'room' ? t("队伍准备") : t("阶段更新")]));
    }, [viewKey]);
    useEffect(() => {
        if (preview) return;
        const update = () => setU(old => ({ ...old, seconds: s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : 0 }));
        update();
        if (!s.deadline) return;
        const timer = window.setInterval(update, 250);
        return () => clearInterval(timer);
    }, [s.deadline, viewKey]);
    useEffect(() => { if (!s.recovering) patch({ submitted: s.submitted }); }, [s.submitted, s.recovering]);
    useEffect(() => { if (s.error) {
        pending.current = false;
        patch({ submitted: false });
        setAnnouncement(localizeError(u.locale, s.error));
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
            if (!current.current.u.powerOn || current.current.u.backView || current.current.u.rosterOpen || current.current.u.manual) return;
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
        if (preview || !local.powerOn || !r.active || !state.connected)
            return;
        state.sendProgress(r.action, r.encrypt ? clues.filter(c => c.trim()).length : guess.filter(Boolean).length, { state: 'editing', focus: slot + 1, ...(r.guess ? { guesses: guess } : {}) });
    }
    function change(target: Pick<Target, 'id'>, value: string) {
        const local = current.current.u;
        if (!local.powerOn) return;
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
            setAnnouncement(local.backView ? t("已回到操作面，所有输入仍然保留") : t("已翻到检修面。可以打开电池仓、试听喇叭或做灯光自检。对局继续进行。"));
            void engine.current?.soundFeedback();
            return;
        }
        if (id === 'power-toggle') {
            if (local.backView) return;
            patch({ powerOn: !local.powerOn, manual: false, rosterOpen: false, archiveOpen: false, focus: 'power-toggle' });
            setArchiveVisible(false);
            setAnnouncement(local.powerOn ? t("终端已关闭；对局继续进行，按电源恢复。") : t("终端电源已开启，输入已保留。"));
            void engine.current?.soundFeedback();
            return;
        }
        if (!local.powerOn && !local.backView) return;
        if (id === 'battery-toggle') {
            patch({ batteryOpen: !local.batteryOpen });
            setAnnouncement(local.batteryOpen ? t("电池仓已合上") : t("电池仓已打开，四节电池与金属触点可见。再次点击电池仓合上。"));
            void engine.current?.soundFeedback();
            return;
        }
        if (id.startsWith('battery-cell-')) {
            if (!local.backView || !local.batteryOpen) return;
            const index = Number(id.slice(-1));
            const removedBatteries = local.removedBatteries ^ (1 << index);
            patch({ removedBatteries });
            setAnnouncement(t("第 {0} 节电池已{1}", [index + 1, removedBatteries & (1 << index) ? t("取出，再次点击装回") : t("装回")]));
            return;
        }
        if (id.startsWith('cable-plug-')) {
            if (!local.backView) return;
            const index = Number(id.slice(-1));
            patch({ unpluggedCables: local.unpluggedCables ^ (1 << index) });
            setAnnouncement(t("{0}已{1}。仅为机械演示。", [[t("网线"), t("串口线"), t("电源线")][index], local.unpluggedCables & (1 << index) ? t("插回") : t("拔出")]));
            return;
        }
        if (id === 'sound-toggle') {
            patch({ soundOn: !local.soundOn });
            engine.current?.setSound(!local.soundOn);
            setAnnouncement(local.soundOn ? t("机械音效已关闭") : t("机械音效已开启，已播放喇叭试听音"));
            return;
        }
        if (id === 'lamp-test') {
            engine.current?.testLamps();
            setAnnouncement(t("本机指示灯自检中，未改变对局或网络连接"));
            return;
        }
        if (local.backView) return;
        if (id === 'receiver-sweep' && local.instrumentVariant === 'signal') {
            patch({ instrumentDemo: !local.instrumentDemo });
            setAnnouncement(local.instrumentDemo ? t("已切回手动调谐") : t("自动信号摆动已开启，旋钮保持原位"));
            void engine.current?.soundFeedback();
            return;
        }
        if (id.startsWith('meter-amplitude') || id.startsWith('meter-rate')) {
            adjustInstrument(id.startsWith('meter-amplitude') ? 'amplitude' : 'rate', id.endsWith('-prev') ? -1 : 1);
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
            setAnnouncement(local.rosterOpen ? t("已返回操作，输入仍然保留") : t("中央屏幕已展开队员名册，按 Escape 返回操作"));
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
            setAnnouncement(t("正在拉出纸带并展开密报记录"));
            void engine.current?.soundFeedback();
            if (failure || !engine.current || matchMedia('(max-width: 850px)').matches) setArchiveVisible(true);
            return;
        }
        if (id === 'disk-toggle' || id === 'disk-eject') {
            patch({ diskOut: id === 'disk-eject' || !local.diskOut });
            setAnnouncement(local.diskOut ? t("软盘已插入") : t("软盘已弹出，再次点击插入"));
            return;
        }
        if (id === 'scope-mode') {
            patch({ scopeMode: nextScopeMode(local.scopeMode) });
            return;
        }
        if (id.startsWith('scope-')) {
            adjustKnob(id.replace('-prev', '').replace('scope-prev', 'scope-tune'), id.endsWith('-prev') || id === 'scope-prev' ? -1 : 1, true);
            return;
        }
        if (id === 'copy-code') {
            engine.current?.pulse('copy-code');
            if (state.roomCode)
                navigator.clipboard.writeText(state.roomCode).then(() => patch({ note: "频道编号已复制。" })).catch(() => patch({ note: t("频道编号：{0}", [state.roomCode]) }));
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
                    patch({ note: "三个密码编号不能重复。" });
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
        if (!state.connected || state.recovering || pending.current)
            return;
        if (preview) {
            if (id === 'transmit' && current.current.content.ready) {
                engine.current?.pulse(id);
                patch({ submitted: true, note: "外观预览：提交反馈已演示。实际联机请移除 preview 参数。" });
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
                patch({ note: "正在接入频道…" });
                local.mode === 'create' ? state.createRoom(local.name.trim()) : state.joinRoom(local.code, local.name.trim());
            }
            else if (state.phase === 'room') {
                patch({ note: "正在启动终端…" });
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
    return <main className={`station ${failure ? 'station-fallback' : ''}`} data-power={u.powerOn ? 'on' : 'off'}
        data-instruments={instrumentPreview || undefined} data-instrument={instrumentPreview ? u.instrumentVariant : undefined}
        data-detail={(instrumentPreview ? instrumentCloseup ? 'meter' : null : detail) || undefined}>
    <div className="station-language" role="group" aria-label="Language / 语言" inert={u.archiveOpen}>
      <button lang="zh-CN" aria-pressed={u.locale === 'zh'} onClick={() => patch({ locale: 'zh' })}>中文</button>
      <button lang="en" aria-pressed={u.locale === 'en'} onClick={() => patch({ locale: 'en' })}>EN</button>
    </div>
    <h1 className="sr-only">{t("Decrypto 谍报风云 · 密码通信终端")}</h1>
    <MobileConsole state={s} local={u} ready={content.ready} status={content.status} onAct={act} onChange={(id, value) => change({ id }, value)} inert={u.archiveOpen}/>
    <div className="station-viewport" inert={u.archiveOpen}>
      <div className="station-stage" ref={stage}>
        {!loaded && !failure && <div className="station-loading"><strong>DECRYPTO</strong><span>{t("正在启动密码终端…")}</span></div>}
        {failure && <div className="station-error" role="alert">{t(failure)}<button onClick={() => location.reload()}>{t("重新载入")}</button></div>}
        <div className="station-controls" aria-label={t("密码通信终端控件")} style={{ visibility: loaded || failure ? 'visible' : 'hidden' }}>
          {content.targets.map(target => {
            const key = target.surface + ':' + target.id;
            const common = {
                ref: (el: HTMLElement | null) => { if (el)
                    controls.current.set(key, el);
                else
                    controls.current.delete(key); },
                'aria-label': target.label, 'data-control': target.id, 'data-surface': target.surface,
                role: isScopeControl(target.id) ? 'slider' : target.id === 'power-toggle' || target.id === 'receiver-sweep' ? 'switch' : undefined,
                'aria-valuemin': isScopeControl(target.id) ? 0 : undefined,
                'aria-valuemax': isScopeControl(target.id) ? 100 : undefined,
                'aria-valuenow': isScopeControl(target.id) ? Math.round((target.id === 'scope-tune' ? u.scopeFreq : target.id === 'scope-rate' ? u.scopeRate : target.id === 'scope-xy' ? u.scopeAxis : target.id === 'meter-amplitude' ? u.meterAmplitude / (instrumentSteps(u.instrumentVariant, 'amplitude') - 1) : u.meterRate / 4) * 1000) / 10 : undefined,
                'aria-valuetext': isScopeControl(target.id) ? target.label : undefined,
                'aria-checked': target.id === 'power-toggle' ? u.powerOn : target.id === 'receiver-sweep' ? u.instrumentDemo : undefined,
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
                    if (isScopeControl(target.id)) adjustKnob(target.id, 1, true); else act(target.id);
                }} onPointerDown={isScopeControl(target.id) ? e => {
                    if (e.button !== 0) return;
                    suppressTuningClick.current = false;
                    tuningDrag.current = { x: e.clientX, y: e.clientY, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                } : target.surface === 'paper' ? e => {
                    if (e.button !== 0) return;
                    suppressPullClick.current = false;
                    pullDrag.current = { y: e.clientY, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                } : undefined} onPointerMove={isScopeControl(target.id) ? e => {
                    const drag = tuningDrag.current;
                    if (!drag) return;
                    const delta = e.clientX - drag.x - (e.clientY - drag.y);
                    if (Math.abs(delta) > .2) {
                        adjustKnob(target.id, delta / (e.shiftKey ? 1400 : 220));
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
                    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); adjustKnob(target.id, e.key === 'Home' ? -40 : 40, true); }
                    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
                        e.preventDefault(); adjustKnob(target.id, (['ArrowDown', 'ArrowLeft'].includes(e.key) ? -1 : 1) * (e.shiftKey ? .1 : 1), true);
                    }
                } : undefined} onWheel={isScopeControl(target.id) ? e => {
                    adjustKnob(target.id, Math.max(-.08, Math.min(.08, e.deltaY * (e.deltaMode ? .012 : .001))) * (e.shiftKey ? .1 : 1));
                } : undefined}>
                {target.label}
              </button>;
        })}
        </div>
        <section hidden={!u.powerOn} className={failure ? 'fallback-readout' : 'sr-only'} aria-label={t("当前通信文字记录")}><h2>{t("当前通信")}</h2><p>{content.status}</p><p>{u.hiddenWords ? t("秘密词已遮住") : s.myWords.map(value => word(value, u.locale)).join(' · ')}</p><p>{s.clues.join(' / ')}</p>
          <p>{t('第 {0} 回合，加密者：{1}', [s.round, s.encryptor])} {roleState(s, u).encrypt ? t("本轮私密密码：{0}", [s.secretDigits.join('、')]) : ''}</p>
          {(['A', 'B'] as const).map(team => <p key={team}>{t('{0} 队     截获 {1} / 2     失误 {2} / 2', [team, (team === 'A' ? s.scoreA : s.scoreB).interceptions, (team === 'A' ? s.scoreA : s.scoreB).decrypt_failures])}</p>)}
          {rosterTeams(s, u).map(team => <section key={team.team} aria-label={t("{0} 队名册", [team.team])}>
            <h3>{t('{0} 队 · {1} 人', [team.team, team.count])}{team.own ? t(" · 我方") : ''} · {t(team.summary)}</h3>
            <ul>{team.seats.map(seat => <li key={seat.code}>{seat.code} · {seat.player ? `${seat.player.nickname}${seat.self && seat.player.nickname !== '你' ? t(" · 你") : ''} · ${seat.player.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}` : t("空席")} · {t(seat.status)}{seat.progress ? t(" · 已完成 {0} / {1}", [seat.progress.step, seat.progress.total]) : ''}</li>)}</ul>
          </section>)}
          {s.gameOver && <p>{s.gameOver.winner ? t("{0} 队获胜", [s.gameOver.winner]) : t("双方平局")}</p>}
          {archiveRows(s, 'all').map(row => <p key={row.round}>{t('第 {0} 回合 · {1} 队', [row.round, row.team])}: {row.clues.join(' / ')} · {t('公开密码')} {row.secret?.join(' · ') || t("未公开")}</p>)}
        </section>
      </div>
    </div>
    {loaded && !failure && <div className="station-workbench" inert={u.archiveOpen}>
      {preview && <span className="station-orbit-hint" aria-hidden="true">{t("中键拖动 · 旋转检查")}</span>}
      {preview === 'roster-motion' && !u.backView && <div className="station-roster-preview" aria-label={t("名牌动画预览")}>
        <span>{t("名牌演示")}</span>
        <button disabled={previewPeople.length >= 4} onClick={() => previewRoster('human')}>{t("真人入席")}</button>
        <button disabled={previewPeople.length >= 4} onClick={() => previewRoster('ai')}>{t("AI 入席")}</button>
        <button disabled={!previewPeople.length} onClick={() => previewRoster('remove')}>{t("末席离开")}</button>
        <button disabled={!previewPeople.length} onClick={() => previewRoster('replace')}>{t("替换末席")}</button>
      </div>}
      {!u.powerOn && <p className="station-rear-status" role="status">
        <span>{t("终端电源已关闭")}</span>
        {['home', 'room', 'round_result', 'game_over'].includes(s.phase) ? t("输入已保留") : t("对局继续计时")} {t("· 按顶部电源开关恢复")}</p>}
      {u.powerOn && u.backView && <p className="station-rear-status" role="status">
        <span>{t("检修面 · 对局仍在进行")}</span>
        {s.phase === 'home' ? t("尚未接入频道") : s.phase === 'room' ? t("队伍准备中") :
            t("第 {0} 回合 · {1}{2}", [s.round, s.phase === 'encrypting' ? t("加密") : s.phase === 'intercept' ? t("拦截") : s.phase === 'decrypt' ? t("解码") : t("阶段已更新"), roleState(s,u).active ? t(" · 轮到你了") : ''])}
      </p>}
      <button className="station-flip" onClick={() => act('flip-console')} aria-pressed={u.backView}>
        <span aria-hidden="true">↶</span>{u.backView ? t("回到操作面") : t("翻到背面")}<small>{u.backView ? 'ESC' : t("检修 / 探索")}</small>
      </button>
    </div>}
    {instrumentPreview && loaded && !failure && <section className="instrument-comparison" aria-label={t("仪表造型对比")} inert={u.archiveOpen}>
      <div className="instrument-comparison-row">
        <span className="instrument-comparison-title">{t("仪表试装")}</span>
        <div className="instrument-options" role="group" aria-label={t("选择仪表方案")}>
          {instrumentOptions.map(option => <button key={option.id} aria-pressed={u.instrumentVariant === option.id}
              onClick={() => selectInstrument(option.id)}>{t(option.label)}</button>)}
        </div>
        <div className="instrument-view" role="group" aria-label={t("观察距离")}>
          <button aria-pressed={!instrumentCloseup} onClick={() => inspectInstrument(false)}>{t("整机")}</button>
          <button aria-pressed={instrumentCloseup} onClick={() => inspectInstrument(true)}>{t("看细节")}</button>
        </div>
        {u.instrumentVariant !== 'signal' && <button className="instrument-demo" disabled={!u.powerOn || u.instrumentVariant === 'original'}
            aria-pressed={u.instrumentDemo} onClick={() => patch({ instrumentDemo: !u.instrumentDemo })}>
          {u.instrumentDemo ? t("停止演示") : t("动态演示")}
        </button>}
      </div>
      <div className="instrument-comparison-row instrument-description">
        <p>{t(instrumentOptions.find(option => option.id === u.instrumentVariant)?.description || '')}</p>
        <span>{t("旋钮可点击、拖动或滚轮调整 · 中键旋转机身")}</span>
      </div>
    </section>}
    {hint && !u.archiveOpen && <div className="station-hint" aria-hidden="true">{content.targets.find(target => target.id === hint)?.label}</div>}
    <p className="mobile-hint">{t("横向滑动查看终端 · 下拉纸带查看密报记录")}</p>
    <ArchiveSheet key={`${s.roomCode || 'offline'}:${s.myPlayerID}:${!!preview}`} open={archiveVisible} locale={u.locale} state={s} onClose={closeArchive} onClosed={restoreArchiveFocus}/>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </main>;
}
