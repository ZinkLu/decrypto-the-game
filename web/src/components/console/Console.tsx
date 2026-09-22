import { translate, localizeError, readLocale, saveLocale } from './i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ConsoleEngine } from './engine';
import { ConsoleAudio, gameSound, type ConsoleSound } from './sound';
import { ConsoleMusic, readMusicPreferences, saveMusicPreferences, type MusicPreferences, type MusicStatus } from './music';
import { consoleHardware, hardwareMessage, hardwareRecovery, terminalView, draftIdentity, syncDiskPower, initialLocal, previewState, roleState, rosterTeams, archiveRows, instrumentSteps, word, instrumentOptions, wordDisplayOptions, stepInstrumentValue, themeChoices, themeColors, readTheme, saveTheme, keyDiskIdentity, keyDiskReadable, keyDiskMessage, syncKeyDisk, advanceKeyDisk, actKeyDisk, keyDiskDurations } from './model';
import type { WordDisplay } from './dotMatrix';
import { defaultDotFilter, dotFilterOptions, readDotFilter, readWordScale, type DotFilter } from './dotFiltering';
import { paint, knobLabel } from './paint';
import { qualityChoices, qualityProfiles, describeQuality, settleQuality, readQuality, saveQuality, readAutoQuality, saveAutoQuality } from './quality';
import ArchiveSheet from './ArchiveSheet';
import MobileConsole from './MobileConsole';
import GuideContent from './GuideContent';
import { guideArtUrl } from './guide';
import { useDiskPull } from './useDiskPull';
import type { LocalState, InstrumentVariant, KeyDiskState } from './model';
import type { Target } from './paint';
import type { PlayerInfo } from '../../store/gameStore';
import type { QualityChoice, QualityLevel } from './quality';
import { consoleRoute, handleSurfaces, handlePull, handleCommit, type HandleSide } from './view';
const route = consoleRoute(location.pathname, location.search, import.meta.env.DEV);
const inspection = route.view === 'preview';
const instrumentPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('instruments');
// DEV bench for the keyword windows' hardware: `/?words=led` or `crt`.
const wordBench = import.meta.env.DEV && !instrumentPreview && new URLSearchParams(location.search).has('words');
const initialWordDisplay = wordBench ? wordDisplayOptions.find(option => option.id === new URLSearchParams(location.search).get('words'))?.id || 'led' : initialLocal.wordDisplay;
// Bench word sets cover every layout: one to five ideographs, doubled and tall sign type, two lines and a marquee.
const benchWords = [
    ['亚特兰蒂斯[atlantis]', '龙[dragon]', '巴黎圣母院[notre dame]', '莎士比亚[shakespeare]'],
    ['潜水员[scuba diver]', '王牌[ace]', '听诊器[stethoscope]', '百万富翁[millionaire]'],
];
const preview = route.scenario;
const detail = import.meta.env.DEV ? new URLSearchParams(location.search).get('detail') : null;
const scoreBench = import.meta.env.DEV && new URLSearchParams(location.search).get('score') === 'flags';
// Deterministic stills and benchmarks pin a level without touching the saved choice.
const pinnedQuality = import.meta.env.DEV ? qualityChoices.find(choice => choice === new URLSearchParams(location.search).get('quality')) : undefined;
const qualityLabels: Record<QualityChoice, string> = { auto: '自动', high: '高', medium: '中', low: '低' };
const initialInstrument = instrumentPreview ? instrumentOptions.find(option => option.id === new URLSearchParams(location.search).get('instruments'))?.id || 'signal' : initialLocal.instrumentVariant;
const scopeControls = ['scope-tune', 'scope-wave', 'scope-rate', 'scope-xy', 'meter-amplitude', 'meter-rate'];
const isScopeControl = (id: string) => scopeControls.includes(id);
export default function Console() {
    const live = useGameStore();
    const [u, setU] = useState<LocalState>(() => { const music = readMusicPreferences(); return { ...initialLocal, musicOn: music.enabled, musicVolume: music.volume, locale: readLocale(), theme: readTheme(), seconds: 90, instrumentVariant: initialInstrument, instrumentDemo: initialInstrument === 'signal', wordDisplay: initialWordDisplay,
        meterAmplitude: initialInstrument === 'signal' ? 14 : initialInstrument === 'tuning' ? 4 : initialInstrument === 'status' ? 0 : 2 }; });
    const [previewPeople, setPreviewPeople] = useState<PlayerInfo[]>([{ id: '0', nickname: '你', is_ai: false }]);
    const previewSerial = useRef(1);
    const [benchWordSet, setBenchWordSet] = useState(0);
    const [reviewScores, setReviewScores] = useState({
        A: { interceptions: 1, decrypt_failures: 0 }, B: { interceptions: 0, decrypt_failures: 1 },
    });
    const s = useMemo(() => {
        if (preview !== 'roster-motion') {
            const state = preview ? previewState(live, preview, u.locale) : live;
            if (scoreBench) return { ...state, scoreA: reviewScores.A, scoreB: reviewScores.B };
            return wordBench && benchWordSet && state.myWords.length ? { ...state, myWords: benchWords[benchWordSet - 1] } : state;
        }
        const state = previewState(live, 'room-partial', u.locale);
        return { ...state, teamA: previewPeople, players: [...previewPeople, ...state.teamB],
            canStart: previewPeople.length >= 2 };
    }, [live, previewPeople, u.locale, benchWordSet, reviewScores]);
    const hardware = consoleHardware(u, s);
    const heldState = useRef(s);
    const displayState = useMemo(() => terminalView(s, heldState.current, u), [s, hardware.online]);
    useLayoutEffect(() => { if (hardware.online) heldState.current = s; }, [s, hardware.online]);
    const [staleDraft, setStaleDraft] = useState<{ round: number; text: string } | null>(null);
    const draftContext = useRef(s);
    const hardwareRoom = useRef(s.roomCode);
    const archiveBlocking = u.archiveOpen && hardware.powered;
    const recovery = hardwareRecovery(u);
    const [instrumentCloseup, setInstrumentCloseup] = useState(detail === 'meter');
    const [wordZoom, setWordZoom] = useState(() => readWordScale(new URLSearchParams(location.search).get('zoom'), detail === 'words'));
    const wordCloseup = wordZoom > 1;
    const [dotFilter, setDotFilter] = useState<DotFilter>(() => wordBench ? readDotFilter(new URLSearchParams(location.search).get('filter')) : defaultDotFilter);
    const [loaded, setLoaded] = useState(false);
    const [diskFontReady, setDiskFontReady] = useState(false);
    const [guideArt, setGuideArt] = useState<HTMLImageElement>();
    useEffect(() => {
        const image = new Image();
        image.decoding = 'async';
        let mounted = true;
        image.onload = () => { if (mounted) setGuideArt(image); };
        image.src = guideArtUrl;
        return () => { mounted = false; image.onload = null; };
    }, []);
    const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [failure, setFailure] = useState('');
    const [archiveVisible, setArchiveVisible] = useState(false);
    const [quality, setQuality] = useState<QualityChoice>(() => pinnedQuality ?? readQuality());
    const [autoLevel, setAutoLevel] = useState<QualityLevel>(() => pinnedQuality ? 'high' : readAutoQuality());
    const [probeRun, setProbeRun] = useState(0);
    const musicPreferences = useMemo(() => ({ enabled: u.musicOn, volume: u.musicVolume }), [u.musicOn, u.musicVolume]);
    const musicPreferencesRef = useRef(musicPreferences);
    musicPreferencesRef.current = musicPreferences;
    const [musicStatus, setMusicStatus] = useState<MusicStatus>('off');
    const level = quality === 'auto' ? autoLevel : quality;
    const stage = useRef<HTMLDivElement>(null);
    const engine = useRef<ConsoleEngine | null>(null);
    const audio = useRef<ConsoleAudio | null>(null);
    const music = useRef<ConsoleMusic | null>(null);
    const previousSoundState = useRef(s);
    const controls = useRef(new Map<string, HTMLElement>());
    // Analog input updates targets and hardware, without repainting all the
    // game screens and the long receipt for each fraction of a knob turn.
    const paintKey = JSON.stringify({ ...u, keyDisk: { ...u.keyDisk, pull: u.keyDisk.pull ? { ...u.keyDisk.pull, amount: 0 } : undefined }, scopeFreq: 0, scopeWave: 0, scopeRate: 0, scopeAxis: 0, meterAmplitude: 0, meterRate: 0 });
    const painted = useMemo(() => paint(displayState, u, inspection, guideArt), [displayState, paintKey, diskFontReady, guideArt]);
    const content = useMemo(() => ({ ...painted, targets: [...painted.targets, ...Object.keys(handleSurfaces).filter(surface =>
        inspection || surface.includes('Rear') === u.backView).map<Target>(surface => ({
            id: surface, surface, x: 0, y: 0, w: 1, h: 1,
            label: translate(u.locale, surface.includes('Rear') ? '点击把手连接处，回到正面' :
                surface.includes('Left') ? '向右拖动左把手，翻到背面' : '向左拖动右把手，翻到背面'),
        }))].map(target =>
        isScopeControl(target.id) ? { ...target, label: knobLabel(target.id, u) } : target) }),
        [painted, u.scopeFreq, u.scopeWave, u.scopeRate, u.scopeAxis, u.meterAmplitude, u.meterRate]);
    const current = useRef({ s, u, content, level });
    current.current = { s, u, content, level };
    const pending = useRef(false);
    const progressLast = useRef(0);
    const tuningDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressTuningClick = useRef(false);
    const pullDrag = useRef<{ y: number; moved: boolean } | null>(null);
    const suppressPullClick = useRef(false);
    const handleDrag = useRef<{ id: string; side: HandleSide; x: number; pointerId: number; progress: number } | null>(null);
    const handleFocusPending = useRef<string | null>(null);
    const archiveFocusPending = useRef(false);
    const [hint, setHint] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const viewKey = draftIdentity(s);
    const diskId = keyDiskIdentity(s);
    const diskReadable = hardware.online && keyDiskReadable(displayState, u);
    const diskPull = useDiskPull({ disk: u.keyDisk, reduced: reducedMotion,
        enabled: !u.backView && !archiveBlocking && !!diskId && u.keyDisk.id === diskId &&
            ['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase),
        axis: () => engine.current?.diskPullAxis() ?? { x: 0, y: 1, pixels: 90 },
        onChange: changeDisk, onClick: () => act('disk-toggle') });
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    useEffect(() => { saveLocale(u.locale); document.documentElement.lang = u.locale === 'zh' ? 'zh-CN' : 'en'; document.title = (u.locale === 'zh' ? 'Decrypto - 谍报风云' : 'Decrypto') + (inspection ? ' · Preview' : ''); setAnnouncement(translate(u.locale, '语言已切换'));  }, [u.locale]);
    useEffect(() => { saveTheme(u.theme); }, [u.theme]);
    function patch(values: Partial<LocalState>) { setU(old => ({ ...old, ...values })); }
    function changeDisk(disk: KeyDiskState) {
        if (disk.id !== keyDiskIdentity(current.current.s)) return;
        setU(old => old.keyDisk.id === disk.id ? { ...old, keyDisk: disk,
            diskOut: ['pulling', 'ejected', 'removed'].includes(disk.phase) || disk.phase === 'settling' && !!disk.pull?.target } : old);
    }
    function playSound(cue: ConsoleSound, gesture = true) { void audio.current?.play(cue, gesture); }
    function facingRear() {
        // A resize can replace a rear-facing 3D machine with the portable terminal.
        if (!inspection && !instrumentPreview && !wordBench && !detail && matchMedia('(max-width: 850px)').matches) return false;
        return engine.current?.facingRear() ?? current.current.u.backView;
    }
    function turnConsole(back: boolean, side: HandleSide = 'left') {
        if (document.activeElement?.matches('.station-handle:focus-visible')) {
            handleFocusPending.current = back ? `handleRear${side === 'left' ? 'Left' : 'Right'}TopControl` :
                `handle${side === 'left' ? 'Left' : 'Right'}Control`;
        }
        engine.current?.turnTo(back, side);
        patch({ backView: back, batteryOpen: false, focus: '' });
        setHint('');
        setAnnouncement(back ? t('已翻到检修面。可分别控制音乐和音效，或检修电池与灯光。对局继续进行。') : t('已回到操作面，所有输入仍然保留'));
        playSound('handle');
    }
    function chooseQuality(choice: QualityChoice) {
        // Choosing Auto again measures this device afresh, starting from high.
        if (choice === 'auto') { setAutoLevel('high'); saveAutoQuality('high'); setProbeRun(run => run + 1); }
        setQuality(choice);
        saveQuality(choice);
        setAnnouncement(t('画质：{0}', [t(qualityLabels[choice])]));
    }
    function adjustInstrument(control: 'amplitude' | 'rate', steps: number) {
        const local = current.current.u;
        if (!consoleHardware(local).powered || facingRear()) return;
        const field = control === 'amplitude' ? 'meterAmplitude' : 'meterRate';
        const value = stepInstrumentValue(local.instrumentVariant, control, local[field], steps);
        if (value !== local[field]) playSound('knob');
        patch({ [field]: value,
            instrumentDemo: local.instrumentVariant === 'signal' && control === 'rate' ? local.instrumentDemo : false });
    }
    // Pointer and wheel input turn a knob continuously; clicks and keys move it
    // in notches. FREQ sits behind a vernier drive, and its notches are quarters
    // of the spacing between engraved marks, so keys still land on every mark.
    function adjustKnob(id: string, delta: number, notches = false) {
        const local = current.current.u;
        if (!consoleHardware(local).powered || facingRear()) return;
        const vernier = id === 'scope-tune';
        const turn = notches ? delta * (vernier ? 1 / 28 : .025) : vernier ? delta * .45 : delta;
        if (id.startsWith('meter-')) {
            const control = id === 'meter-amplitude' ? 'amplitude' : 'rate';
            adjustInstrument(control, turn * (instrumentSteps(local.instrumentVariant, control) - 1));
            return;
        }
        const field = vernier ? 'scopeFreq' : id === 'scope-wave' ? 'scopeWave' : id === 'scope-rate' ? 'scopeRate' : 'scopeAxis';
        if (Math.max(0, Math.min(1, local[field] + turn)) !== local[field]) playSound('knob');
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
    function selectWordDisplay(display: WordDisplay) {
        patch({ wordDisplay: display });
        const url = new URL(location.href);
        url.searchParams.set('words', display);
        history.replaceState(null, '', url);
        setAnnouncement(t("已试装{0}", [t(wordDisplayOptions.find(option => option.id === display)?.label || '')]));
    }
    function inspectWords(closeup: boolean) {
        zoomWords(closeup ? 2 : 1);
    }
    function zoomWords(scale: number) {
        setWordZoom(scale);
        const url = new URL(location.href);
        url.searchParams.set('zoom', String(scale));
        if (scale > 1) url.searchParams.set('detail', 'words'); else url.searchParams.delete('detail');
        history.replaceState(null, '', url);
    }
    function selectDotFilter(filter: DotFilter) {
        setDotFilter(filter);
        const url = new URL(location.href);
        url.searchParams.set('filter', filter);
        history.replaceState(null, '', url);
        setAnnouncement(t('LED 缩放：{0}', [t(dotFilterOptions.find(option => option.id === filter)!.label)]));
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
        if (archiveVisible && (failure || !engine.current || matchMedia('(max-width: 850px)').matches)) playSound('paper-tear');
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
            if (handleDrag.current?.id === target.id) continue;
            const bounds = e.bounds(target);
            if (node && !failure) node.style.visibility = bounds ? 'visible' : 'hidden';
            if (node && bounds) {
                Object.assign(node.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
                if (target.kind === 'input' && target.input) {
                    // Keep logical CRT typography and scale the entire native editor,
                    // including its padding, selection, IME text and caret together.
                    Object.assign(node.style, { width: target.w + 'px', height: target.h + 'px',
                        fontSize: target.input.fontSize + 'px', padding: `0 ${target.input.padding}px`,
                        transform: `scale(${bounds.width / target.w}, ${bounds.height / target.h})`,
                        caretColor: current.current.content.tint });
                }
                if (handleFocusPending.current === target.id) {
                    handleFocusPending.current = null;
                    node.focus({ preventScroll: true });
                }
            }
        }
    }
    useEffect(() => {
        let cancelled = false;
        // Canvas textures must repaint once the bundled handwriting font arrives.
        void document.fonts.load('700 52px "Disk Hand"').then(() => {
            if (!cancelled) setDiskFontReady(true);
        }).catch(() => { /* The local handwriting/cursive fallback remains usable. */ });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        if (!preview)
            live.connect();
        return () => { if (!preview)
            useGameStore.getState().disconnect(); };
    }, []);
    useEffect(() => {
        const speaker = new ConsoleAudio();
        const score = new ConsoleMusic(() => speaker.output(), setMusicStatus);
        audio.current = speaker;
        music.current = score;
        speaker.onUnlock = () => { void score.refresh(); };
        speaker.onSound = cue => score.duck(cue);
        speaker.prepare();
        speaker.setEnabled(current.current.u.soundOn);
        score.configure({ ...musicPreferencesRef.current, powered: consoleHardware(current.current.u).powered });
        score.transition(current.current.s, current.current.s);
        const visibility = () => {
            speaker.setVisible(!document.hidden);
            score.configure({ visible: !document.hidden });
        };
        visibility();
        // Unlock both independent channels on the first interaction, even when effects are off.
        const unlock = () => { void speaker.unlock(); };
        document.addEventListener('pointerdown', unlock, { capture: true });
        document.addEventListener('keydown', unlock, { capture: true });
        document.addEventListener('visibilitychange', visibility);
        return () => {
            document.removeEventListener('visibilitychange', visibility);
            document.removeEventListener('pointerdown', unlock, true);
            document.removeEventListener('keydown', unlock, true);
            score.dispose();
            speaker.dispose();
            audio.current = null;
            music.current = null;
        };
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
            }, inspection, instrumentPreview, cue => {
                if (consoleHardware(current.current.u).powered && (inspection || !matchMedia('(max-width: 850px)').matches)) playSound(cue, false);
            }, moving => {
                void audio.current?.setPaperFeed(moving && consoleHardware(current.current.u).powered &&
                    (inspection || !matchMedia('(max-width: 850px)').matches));
            }, event => {
                // A tube still discharges after mains-off; the effects switch still gates it.
                if (inspection || !matchMedia('(max-width: 850px)').matches) void audio.current?.crt(event);
            });
            instance.setQuality(qualityProfiles[current.current.level]);
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
    useLayoutEffect(() => { engine.current?.setKeyDisk(u.keyDisk); project(); }, [u.keyDisk]);
    useLayoutEffect(() => { engine.current?.setQuality(qualityProfiles[level]); }, [level]);
    useLayoutEffect(() => { if (wordBench) engine.current?.setDotFilter(dotFilter); }, [loaded, dotFilter]);
    useLayoutEffect(() => { if (wordBench && loaded) engine.current?.inspectWordScale(wordZoom); }, [loaded, wordZoom]);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const change = () => setReducedMotion(media.matches);
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, []);
    useLayoutEffect(() => {
        setU(old => {
            const disk = syncKeyDisk(old.keyDisk, diskId, performance.now(),
                consoleHardware(old, s).online && (loaded || !!failure || matchMedia('(max-width: 850px)').matches), reducedMotion);
            return disk === old.keyDisk ? old : { ...old, keyDisk: disk, diskOut: false };
        });
    }, [diskId, loaded, failure, hardware.online, reducedMotion]);
    useLayoutEffect(() => {
        setU(old => {
            const keyDisk = syncDiskPower(old.keyDisk, consoleHardware(old).powered, performance.now());
            return keyDisk === old.keyDisk ? old : { ...old, keyDisk };
        });
    }, [hardware.powered, u.keyDisk]);
    useEffect(() => {
        const disk = u.keyDisk, duration = keyDiskDurations[disk.phase];
        if (duration === undefined || disk.pausedAt !== undefined || disk.phase === 'reading' && !hardware.powered) return;
        const timer = window.setTimeout(() => setU(old => {
            if (old.keyDisk !== disk) return old;
            const next = advanceKeyDisk(disk, performance.now(), reducedMotion);
            return next === disk ? old : { ...old, keyDisk: next, diskOut: ['ejected', 'removed'].includes(next.phase) };
        }), reducedMotion ? 0 : Math.max(0, duration - (performance.now() - disk.startedAt)) + 1);
        return () => clearTimeout(timer);
    }, [u.keyDisk, reducedMotion, hardware.powered]);
    useEffect(() => {
        if (u.keyDisk.id) setAnnouncement(t(u.keyDisk.pausedAt !== undefined ? '读盘暂停 · 等待供电恢复' : keyDiskMessage(u.keyDisk)));
        if (u.keyDisk.phase === 'inserting' && hardware.powered) playSound('disk-in', false);
    }, [u.keyDisk.phase, u.keyDisk.startedAt, u.keyDisk.id]);
    useEffect(() => {
        if (!loaded || quality !== 'auto') return;
        let cancelled = false;
        // Auto steps down until one synchronised frame fits the budget.
        void (async () => {
            for (let settled = current.current.level; engine.current;) {
                const cost = await engine.current.probe();
                if (cancelled) return;
                const next = settleQuality(settled, cost);
                if (next === settled) return;
                settled = next;
                setAutoLevel(next);
                saveAutoQuality(next);
                engine.current?.setQuality(qualityProfiles[next]);
            }
        })();
        return () => { cancelled = true; };
    }, [loaded, quality, probeRun]);
    useLayoutEffect(() => {
        const previous = draftContext.current, local = current.current.u;
        draftContext.current = s;
        if (previous.roomCode !== s.roomCode || previous.myPlayerID !== s.myPlayerID || previous.myTeam !== s.myTeam) setStaleDraft(null);
        else if (draftIdentity(previous) !== viewKey && !consoleHardware(local, s).online && !local.submitted && !previous.submitted) {
            const text = previous.myRole === 'encryptor' ? local.clues.filter(c => c.trim()).join(' / ') : local.guess.filter(Boolean).join(' · ');
            if (text) setStaleDraft({ round: previous.round, text });
        }
        pending.current = false;
        setU(old => ({ ...old, clues: ['', '', ''], guess: [0, 0, 0], slot: 0, submitted: false, focus: '', note: '', manual: false, about: false,
            seconds: preview ? 45 : s.phase === 'encrypting' ? 90 : 60 }));
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
    useEffect(() => {
        saveMusicPreferences(musicPreferences);
        music.current?.configure(musicPreferences);
    }, [musicPreferences]);
    useEffect(() => {
        // Advance the baseline while isolated so recovery cannot replay missed events.
        const musicalEnding = hardware.online ? music.current?.transition(previousSoundState.current, s) : false;
        const cue = gameSound(previousSoundState.current, s);
        previousSoundState.current = s;
        if (cue && !musicalEnding && hardware.online) playSound(cue, false);
    }, [s]);
    useLayoutEffect(() => {
        music.current?.configure({ powered: hardware.powered });
        if (!hardware.powered) setArchiveVisible(false);
    }, [hardware.powered]);
    useEffect(() => {
        if (hardware.online) music.current?.transition(s, s, false);
    }, [hardware.online]);
    useLayoutEffect(() => {
        if (hardwareRoom.current !== s.roomCode) {
            hardwareRoom.current = s.roomCode;
            patch({ unpluggedCables: 0, removedBatteries: 0, batteryOpen: false });
        }
    }, [s.roomCode]);
    useEffect(() => { if (s.error) {
        pending.current = false;
        patch({ submitted: false });
        setAnnouncement(localizeError(u.locale, s.error));
        if (consoleHardware(current.current.u, current.current.s).online) playSound('error', false);
    } }, [s.error]);
    useEffect(() => { pending.current = false; }, [s.teamA, s.teamB, s.roomCode]);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.isComposing)
                return;
            if (document.querySelector('.archive-dialog[open]')) return;
            if (current.current.u.archiveOpen && consoleHardware(current.current.u).powered) {
                if (event.key === 'Escape') closeArchive();
                return;
            }
            if (event.key === 'Escape') {
                if (handleDrag.current) {
                    handleDrag.current = null;
                    engine.current?.releaseHandle();
                    stage.current?.removeAttribute('data-handling');
                    project();
                }
                else {
                    if (current.current.u.manual || current.current.u.about)
                        handleFocusPending.current = current.current.u.about ? 'about' : 'manual';
                    patch({ archiveOpen: false, manual: false, about: false });
                }
                return;
            }
            if (!consoleHardware(current.current.u).powered || facingRear() || (current.current.u.manual || current.current.u.about)) return;
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
        if (preview || !consoleHardware(local, state).online || !r.active)
            return;
        state.sendProgress(r.action, r.encrypt ? clues.filter(c => c.trim()).length : guess.filter(Boolean).length, { state: 'editing', focus: slot + 1, ...(r.guess ? { guesses: guess } : {}) });
    }
    function change(target: Pick<Target, 'id'>, value: string) {
        const local = current.current.u;
        if (!consoleHardware(local).powered) return;
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
    function changeMusic(values: Partial<MusicPreferences>) {
        const next = { ...musicPreferencesRef.current, ...values };
        musicPreferencesRef.current = next;
        patch({ musicOn: next.enabled, musicVolume: next.volume });
        music.current?.configure(next);
        void audio.current?.unlock().then(() => music.current?.refresh());
    }
    function changeHardware(values: Partial<LocalState>, message?: string) {
        const old = current.current.u, next = { ...old, ...values };
        current.current.u = next;
        setU(previous => ({ ...previous, ...values }));
        const before = consoleHardware(old), after = consoleHardware(next);
        if (before.powered !== after.powered) {
            audio.current?.silence();
            playSound(after.powered ? 'power-on' : 'power-off');
        } else playSound('latch');
        setHint('');
        setAnnouncement(message ? `${message} · ${translate(next.locale, hardwareMessage(next, current.current.s))}` :
            translate(next.locale, hardwareMessage(next, current.current.s)));
    }
    function act(id: string) {
        const { s: state, u: local } = current.current;
        const r = roleState(state, local);
        const rear = facingRear();
        if (id in handleSurfaces) {
            turnConsole(!id.includes('Rear'), id.includes('Left') ? 'left' : 'right');
            return;
        }
        if (id === 'restore-power' || id === 'restore-link') {
            changeHardware({ unpluggedCables: local.unpluggedCables & ~(id === 'restore-power' ? 4 : 1) });
            return;
        }
        if (id === 'power-toggle' || id === 'restore-switch') {
            if (rear && id === 'power-toggle') return;
            changeHardware({ powerOn: id === 'restore-switch' || !local.powerOn, manual: false, about: false, focus: 'power-toggle' });
            return;
        }
        if (id === 'sound-toggle') {
            const on = !local.soundOn;
            // Gate synchronously, before React paints the physical switch.
            audio.current?.setEnabled(on);
            patch({ soundOn: on });
            if (on && consoleHardware(local).powered) playSound('switch');
            setAnnouncement(on ? t("音效已开启") : t("音效已关闭"));
            return;
        }
        if (id === 'music-toggle') {
            const on = !musicPreferencesRef.current.enabled;
            changeMusic({ enabled: on });
            playSound('switch');
            setAnnouncement(on ? t('背景音乐已开启') : t('背景音乐已关闭'));
            return;
        }
        if (!consoleHardware(local).powered && !rear && !['disk-toggle', 'disk-eject'].includes(id)) return;
        if (id === 'battery-toggle') {
            patch({ batteryOpen: !local.batteryOpen });
            setAnnouncement(local.batteryOpen ? t("电池仓已合上") : t("电池仓已打开，四节电池与金属触点可见。再次点击电池仓合上。"));
            playSound('latch');
            return;
        }
        if (id.startsWith('battery-cell-')) {
            if (!rear || !local.batteryOpen) return;
            const index = Number(id.slice(-1));
            const removedBatteries = local.removedBatteries ^ (1 << index);
            changeHardware({ removedBatteries }, t("第 {0} 节电池已{1}", [index + 1, removedBatteries & (1 << index) ? t("取出，再次点击装回") : t("装回")]));
            return;
        }
        if (id.startsWith('cable-plug-')) {
            if (!rear) return;
            const index = Number(id.slice(-1));
            changeHardware({ unpluggedCables: local.unpluggedCables ^ (1 << index) },
                t('{0}已{1}', [[t('网线'), t('串口线'), t('电源线')][index], local.unpluggedCables & (1 << index) ? t('插回') : t('拔出')]));
            return;
        }
        if (id === 'lamp-test') {
            if (!consoleHardware(local).powered) return;
            engine.current?.testLamps();
            playSound('test');
            setAnnouncement(t("本机指示灯自检中，未改变对局或网络连接"));
            return;
        }
        if (rear) return;
        if (id === 'receiver-sweep' && local.instrumentVariant === 'signal') {
            patch({ instrumentDemo: !local.instrumentDemo });
            setAnnouncement(local.instrumentDemo ? t("已切回手动调谐") : t("自动信号摆动已开启，旋钮保持原位"));
            playSound('switch');
            return;
        }
        if (id.startsWith('meter-amplitude') || id.startsWith('meter-rate')) {
            adjustInstrument(id.startsWith('meter-amplitude') ? 'amplitude' : 'rate', id.endsWith('-prev') ? -1 : 1);
            return;
        }
        if (id === 'manual' || id === 'about' || id === 'screen-close') {
            if (id === 'screen-close') handleFocusPending.current = local.about ? 'about' : 'manual';
            patch({ manual: id === 'manual' && !local.manual, about: id === 'about' && !local.about, focus: '' });
            playSound('key');
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
            if (failure || !engine.current || matchMedia('(max-width: 850px)').matches) {
                playSound('paper-feed');
                setArchiveVisible(true);
            } else void audio.current?.unlock();
            return;
        }
        if (id === 'disk-toggle' || id === 'disk-eject') {
            if (local.keyDisk.id !== keyDiskIdentity(state)) return;
            const out = id === 'disk-eject' || !['ejected', 'removed'].includes(local.keyDisk.phase);
            const disk = actKeyDisk(local.keyDisk, out, performance.now(), reducedMotion);
            if (disk === local.keyDisk) return;
            if (out) playSound('key');
            else void audio.current?.unlock();
            patch({ keyDisk: disk, diskOut: out });
            setHint('');
            return;
        }
        if (id.startsWith('scope-')) {
            adjustKnob(id.replace('-prev', '').replace('scope-prev', 'scope-tune'), id.endsWith('-prev') || id === 'scope-prev' ? -1 : 1, true);
            return;
        }
        if (id === 'copy-code') {
            if (!consoleHardware(local, state).online) return;
            if (state.roomCode) playSound('key');
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
            if (!r.guess || !r.active || !consoleHardware(local, state).online || local.manual || local.about)
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
                    playSound('error');
                    return;
                }
                guess[slot] = n + 1;
                slot = Math.min(2, slot + 1);
            }
            patch({ guess, slot, note: '' });
            progress(local.clues, guess, slot, true);
            engine.current?.pulse(id);
            playSound('key');
            return;
        }
        if (!consoleHardware(local, state).online || pending.current)
            return;
        if (preview) {
            if (id === 'transmit' && current.current.content.ready) {
                engine.current?.pulse(id);
                playSound('transmit');
                patch({ submitted: true, note: "预览提交已完成。进入游戏页面即可联机游玩。" });
            }
            return;
        }
        if (id === 'transmit') {
            if (!current.current.content.ready)
                return;
            engine.current?.pulse(id);
            playSound('transmit');
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
    const qualityHint = (choice: QualityChoice) => choice === 'auto'
        ? `${t('按本机实测的单帧耗时选择档位；再次点击重新检测')} · ${t('当前')} ${t(qualityLabels[level])}`
        : `${t(qualityLabels[choice])} · ${describeQuality(qualityProfiles[choice], t)}`;
    const colors = themeColors(u.theme);
    return <main style={{ '--guide-accent': colors.own.light, '--team-own': colors.own.ink, '--team-opponent': colors.opponent.ink, '--device-ink': colors.device.ink } as CSSProperties} data-theme={u.theme} className={`station ${failure ? 'station-fallback' : ''}`} data-view={route.view} data-power={hardware.powered ? 'on' : 'off'} data-supply={hardware.supply} data-link={hardware.online ? 'online' : 'offline'} data-aux={hardware.auxAvailable ? 'on' : 'off'}
        data-backdrop-blur={qualityProfiles[level].backdropBlur ? undefined : 'off'}
        data-instruments={instrumentPreview || wordBench || undefined} data-instrument={instrumentPreview ? u.instrumentVariant : undefined}
        data-word-bench={wordBench || undefined}
        data-detail={(instrumentPreview ? instrumentCloseup ? 'meter' : null : wordBench ? wordCloseup ? 'words' : null : detail) || undefined}>
    <div className="station-settings" inert={archiveBlocking}>
      <nav className="station-navigation" aria-label={t('页面导航')}>
        <a href="/" aria-current={!inspection ? 'page' : undefined}>{t('游戏')}</a>
        <a href="/preview" aria-current={inspection ? 'page' : undefined}>Preview</a>
      </nav>
      <details className="station-preferences"><summary>{t('设置')}</summary><div className="station-preferences-panel">
      {!failure && <div className="station-quality" role="group" aria-label={t("画质")}>
        <span aria-hidden="true">{t("画质")}</span>
        {qualityChoices.map(choice => <button key={choice} aria-pressed={quality === choice} title={qualityHint(choice)}
            onClick={() => chooseQuality(choice)} onMouseEnter={() => setHint('quality:' + choice)} onMouseLeave={() => setHint('')}
            onFocus={() => setHint('quality:' + choice)} onBlur={() => setHint('')}>
          {t(qualityLabels[choice])}{choice === 'auto' && quality === 'auto' && <small>{t(qualityLabels[level])}</small>}
        </button>)}
      </div>}
      <fieldset className="station-themes"><legend>{t('主题')}</legend>
        <div className="station-theme-options">
          {themeChoices.map(theme => <button key={theme.id} type="button" aria-pressed={u.theme === theme.id}
            onClick={event => {
              patch({ theme: theme.id });
              setAnnouncement(t('主题已切换为{0}', [t(theme.label)]));
              // Reveal the physical exchange instead of covering it with Settings.
              const settings = event.currentTarget.closest('details');
              if (settings) { settings.open = false; settings.querySelector('summary')?.focus({ preventScroll: true }); }
            }}>
            <span className="station-theme-swatches" aria-hidden="true"><i style={{ background: theme.own.plate }}/><i style={{ background: theme.opponent.plate }}/><i style={{ background: theme.led.word }}/><i style={{ background: theme.led.legend }}/></span>
            {t(theme.label)}
          </button>)}
        </div>
      </fieldset>
      <fieldset className="station-music"><legend>{t('声音')}</legend>
        <div className="station-music-row">
          <span>{t('音效')}</span>
          <button type="button" role="switch" aria-checked={u.soundOn} aria-label={t('音效')}
            onClick={() => act('sound-toggle')}>{t(u.soundOn ? '已开启' : '已关闭')}</button>
        </div>
        <div className="station-music-row">
          <span>{t('背景音乐')}</span>
          <button type="button" role="switch" aria-checked={musicPreferences.enabled} aria-label={t('背景音乐')}
            onClick={() => act('music-toggle')}>{t(musicPreferences.enabled ? '已开启' : '已关闭')}</button>
        </div>
        <label className="station-music-volume"><span>{t('音乐音量')}</span>
          <input type="range" min="0" max="100" step="1" value={Math.round(musicPreferences.volume * 100)}
            aria-valuetext={`${Math.round(musicPreferences.volume * 100)}%`}
            onChange={event => changeMusic({ volume: Number(event.target.value) / 100 })}/>
          <output>{Math.round(musicPreferences.volume * 100)}%</output>
        </label>
        <p role="status">{!hardware.powered ? t('终端关机，音乐已暂停。') : !musicPreferences.enabled ? t('开启后随大厅、对局与结局播放。') :
            musicStatus === 'error' ? t('音乐未能载入，可重试；游戏不受影响。') : musicStatus === 'loading' ? t('正在载入音乐…') :
            musicStatus === 'playing' ? t('正在播放背景音乐') : t('音乐已就绪，结算后保持安静。')}</p>
        {musicStatus === 'error' && <button type="button" onClick={() => { void audio.current?.unlock().then(() => music.current?.refresh()); }}>{t('重试音乐')}</button>}
        <a href="/audio/CREDITS.md" target="_blank" rel="noreferrer">{t('音乐与音效来源')}</a>
      </fieldset>
      <div className="station-language" role="group" aria-label="Language / 语言">
        <button lang="zh-CN" aria-pressed={u.locale === 'zh'} onClick={() => patch({ locale: 'zh' })}>中文</button>
        <button lang="en" aria-pressed={u.locale === 'en'} onClick={() => patch({ locale: 'en' })}>EN</button>
      </div>
      </div></details>
    </div>
    <h1 className="sr-only">{t("Decrypto 谍报风云 · 密码通信终端")}</h1>
    <MobileConsole state={displayState} local={u} ready={content.ready} status={content.status} onAct={act} onChange={(id, value) => change({ id }, value)} onDiskChange={changeDisk} reducedMotion={reducedMotion} inert={archiveBlocking}/>
    <div className="station-viewport" inert={archiveBlocking}>
      <div className="station-stage" ref={stage}>
        {!loaded && !failure && <div className="station-loading"><strong>DECRYPTO</strong><span>{t("正在启动密码终端…")}</span></div>}
        {failure && <div className="station-error" role="alert">{t(failure)}<button onClick={() => location.reload()}>{t("重新载入")}</button></div>}
        <div className="sr-only">{(u.manual || u.about) && <GuideContent locale={u.locale} about={u.about} transcript/>}</div>
        <div className="station-controls" aria-label={t("密码通信终端控件")} style={{ visibility: loaded || failure ? 'visible' : 'hidden' }}>
          {content.targets.map(target => {
            const key = target.surface + ':' + target.id;
            const common = {
                ref: (el: HTMLElement | null) => { if (el)
                    controls.current.set(key, el);
                else
                    controls.current.delete(key); },
                'aria-label': target.label, 'data-control': target.id, 'data-surface': target.surface,
                role: isScopeControl(target.id) ? 'slider' : ['power-toggle', 'receiver-sweep', 'sound-toggle', 'music-toggle'].includes(target.id) ? 'switch' : undefined,
                'aria-valuemin': isScopeControl(target.id) ? 0 : undefined,
                'aria-valuemax': isScopeControl(target.id) ? 100 : undefined,
                'aria-valuenow': isScopeControl(target.id) ? Math.round((target.id === 'scope-tune' ? u.scopeFreq : target.id === 'scope-wave' ? u.scopeWave : target.id === 'scope-rate' ? u.scopeRate : target.id === 'scope-xy' ? u.scopeAxis : target.id === 'meter-amplitude' ? u.meterAmplitude / (instrumentSteps(u.instrumentVariant, 'amplitude') - 1) : u.meterRate / 4) * 1000) / 10 : undefined,
                'aria-valuetext': isScopeControl(target.id) ? target.label : undefined,
                'aria-checked': target.id === 'power-toggle' ? u.powerOn : target.id === 'receiver-sweep' ? u.instrumentDemo : target.id === 'sound-toggle' ? u.soundOn : target.id === 'music-toggle' ? u.musicOn : undefined,
                disabled: target.disabled,
                style: failure ? { visibility: 'visible' as const } : undefined,
                title: target.label,
                'aria-expanded': target.id === 'archive-toggle' ? u.archiveOpen : target.id === 'battery-toggle' ? u.batteryOpen : undefined,
                'aria-haspopup': target.id === 'archive-toggle' ? 'dialog' as const : undefined,
                'aria-pressed': target.id === 'disk-toggle' ? u.diskOut : target.id === 'manual' ? u.manual : target.id === 'about' ? u.about : undefined,
                onMouseEnter: () => setHint(target.id),
                onMouseLeave: () => setHint(''),
                onFocus: () => { setHint(target.id); patch({ focus: target.id }); if (target.id.startsWith('clue-'))
                    progress(u.clues, u.guess, Number(target.id.slice(5)), true); },
                onBlur: () => { setHint(''); if (current.current.u.focus === target.id)
                    patch({ focus: '' }); },
            };
            if (target.href) return <a key={key} {...common} href={target.href} target="_blank" rel="noopener noreferrer">{target.label}</a>;
            if (target.id === 'disk-toggle') return <button key={key} {...common} {...diskPull} className="station-disk-grip" data-phase={u.keyDisk.phase}>
                {!target.disabled && <span className="disk-grip-hint" aria-hidden="true">{t(u.keyDisk.phase === 'removed' ? '点击插回' : '按住软盘向外拖')}</span>}
            </button>;
            if (target.id in handleSurfaces) return <button key={key} {...common} className="station-handle"
                onClick={e => { if (target.id.includes('Rear') || e.detail === 0 || failure) act(target.id); }}
                onPointerDown={e => {
                    if (e.button !== 0 || target.id.includes('Rear')) return;
                    const side = target.id.includes('Left') ? 'left' : 'right';
                    if (!engine.current?.beginHandle(side)) return;
                    e.preventDefault();
                    handleDrag.current = { id: target.id, side, x: e.clientX, pointerId: e.pointerId, progress: 0 };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    stage.current?.setAttribute('data-handling', 'true');
                }}
                onPointerMove={e => {
                    const drag = handleDrag.current;
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    drag.progress = handlePull(drag.side, e.clientX - drag.x, stage.current?.clientWidth || 1);
                    engine.current?.pullHandle(drag.progress);
                }}
                onPointerUp={e => {
                    const drag = handleDrag.current;
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    handleDrag.current = null;
                    engine.current?.releaseHandle();
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    stage.current?.removeAttribute('data-handling');
                    if (drag.progress >= handleCommit) turnConsole(true, drag.side);
                    else { setAnnouncement(t('向内拖动把手，即可翻面')); project(); }
                }}
                onLostPointerCapture={() => {
                    if (!handleDrag.current) return;
                    handleDrag.current = null;
                    engine.current?.releaseHandle();
                    stage.current?.removeAttribute('data-handling');
                    project();
                }}
                onPointerCancel={() => {
                    handleDrag.current = null;
                    engine.current?.releaseHandle();
                    stage.current?.removeAttribute('data-handling');
                    project();
                }}>{target.label}</button>;
            return target.kind === 'input' ? <input key={key} {...common} type="text" value={target.value || ''} maxLength={target.maxLength} placeholder={target.input?.placeholder || target.label} autoComplete={target.id === 'name' ? 'nickname' : 'off'} spellCheck={false} onChange={e => change(target, e.target.value)} onKeyDown={e => {
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
        <section hidden={!hardware.powered} className={failure ? 'fallback-readout' : 'sr-only'} aria-label={t("当前通信文字记录")}><h2>{t(hardware.online ? '当前通信' : '已断开连接')}</h2><p>{content.status}</p>
          {hardware.batteryPercent !== null && <p>{t('电池电量 {0}%', [hardware.batteryPercent])}</p>}
          {!hardware.online && <p>CH 0000 · {t('离线')}</p>}
          <p>{!hardware.online ? Array.from({ length: 4 }, (_, i) => `${i + 1} ${t('离线')}`).join(' · ') : u.hiddenWords ? t("秘密词已遮住") : displayState.myWords.map(value => word(value, u.locale)).join(' · ')}</p>
          <p>{hardware.online ? displayState.clues.join(' / ') : t('输入已保留，不会自动提交。')}</p>
          <p>{t('第 {0} 回合，加密者：{1}', [displayState.round, displayState.encryptor])} {diskReadable ? t("本轮私密密码：{0}", [displayState.secretDigits.join('、')]) : ''}</p>
          {(['A', 'B'] as const).map(team => <p key={team}>{t('{0} 队     截获 {1} / 2     失误 {2} / 2', [team, (team === 'A' ? displayState.scoreA : displayState.scoreB).interceptions, (team === 'A' ? displayState.scoreA : displayState.scoreB).decrypt_failures])}</p>)}
          {rosterTeams(displayState, u).map(team => <section key={team.team} aria-label={t("{0} 队名册", [team.team])}>
            <h3>{t('{0} 队 · {1} 人', [team.team, team.count])}{team.own ? t(" · 我方") : ''} · {t(team.summary)}</h3>
            <ul>{team.seats.map(seat => <li key={seat.code}>{seat.code} · {seat.player ? `${seat.player.nickname}${seat.self && seat.player.nickname !== '你' ? t(" · 你") : ''} · ${seat.player.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}` : t("空席")} · {t(seat.status)}{seat.progress ? t(" · 已完成 {0} / {1}", [seat.progress.step, seat.progress.total]) : ''}</li>)}</ul>
          </section>)}
          {displayState.gameOver && <p>{displayState.gameOver.winner ? t("{0} 队获胜", [displayState.gameOver.winner]) : t("双方平局")}</p>}
          {archiveRows(displayState, 'all').map(row => <p key={row.round}>{t('第 {0} 回合 · {1} 队', [row.round, row.team])}: {row.clues.join(' / ')} · {t('公开密码')} {row.secret?.join(' · ') || t("未公开")}</p>)}
        </section>
      </div>
    </div>
    {loaded && !failure && <div className="station-workbench" inert={archiveBlocking}>
      {!scoreBench && <span className="station-orbit-hint">{t(inspection ? '拖动机身旋转 · 滚轮缩放 · 拖动把手翻面' : u.backView ? '点击把手连接处，回到正面' : '向内拖动把手，即可翻面')}</span>}
      {inspection && <button className="station-reset-view" onClick={() => engine.current?.resetInspection()}>{t('重置视角')}</button>}
      {scoreBench && !u.backView && <div className="station-roster-preview station-score-preview" aria-label={t('翻旗积分板试装')}>
        <span>{t('翻旗试装')}</span>
        {(['A', 'B'] as const).flatMap(team => (['interceptions', 'decrypt_failures'] as const).map(field =>
          <button key={`${team}-${field}`} disabled={!hardware.powered}
            aria-label={t('循环切换 {0} 队{1}计分', [team, t(field === 'interceptions' ? '截获' : '失误')])}
            onClick={() => setReviewScores(scores => ({ ...scores,
              [team]: { ...scores[team], [field]: (scores[team][field] + 1) % 3 } }))}>
            {team} · {t(field === 'interceptions' ? '截获' : '失误')} {reviewScores[team][field]}/2
          </button>))}
        <button disabled={!hardware.powered} onClick={() => setReviewScores({
          A: { interceptions: 0, decrypt_failures: 0 }, B: { interceptions: 0, decrypt_failures: 0 },
        })}>{t('清零')}</button>
      </div>}
      {preview === 'roster-motion' && !u.backView && <div className="station-roster-preview" aria-label={t("名牌动画预览")}>
        <span>{t("名牌演示")}</span>
        <button disabled={previewPeople.length >= 4} onClick={() => previewRoster('human')}>{t("真人入席")}</button>
        <button disabled={previewPeople.length >= 4} onClick={() => previewRoster('ai')}>{t("AI 入席")}</button>
        <button disabled={!previewPeople.length} onClick={() => previewRoster('remove')}>{t("末席离开")}</button>
        <button disabled={!previewPeople.length} onClick={() => previewRoster('replace')}>{t("替换末席")}</button>
      </div>}
    </div>}
    {(u.backView || !hardware.online || staleDraft) && <aside className="station-hardware-status" aria-label={t('终端状态')}>
      <p role="status">{t(hardwareMessage(u, s))}</p>
      <p className="hardware-match">{u.backView && <>{t(hardware.supply === 'external' ? '外部供电' : hardware.supply === 'battery' ? '电池供电' : '无供电')} · </>}{s.phase === 'home' ? t('尚未接入频道') : s.phase === 'room' ? t('队伍准备中') :
          s.phase === 'game_over' ? t('行动结束') : t('第 {0} 回合 · 对局仍在进行', [s.round])}</p>
      {recovery && <button type="button" data-hardware-recovery={recovery.id} onClick={() => act(recovery.id)}>{t(recovery.label)}</button>}
      {u.backView && hardware.powered && !hardware.aux && hardwareRecovery(u) && <p>{t('AUX 已断开 · SIGNAL 无外部输入')}</p>}
      {staleDraft && <details><summary>{t('旧草稿 · 第 {0} 回合', [staleDraft.round])}</summary><p>{staleDraft.text}</p><small>{t('仅供查看，不会自动提交')}</small></details>}
    </aside>}
    {instrumentPreview && loaded && !failure && <section className="instrument-comparison" aria-label={t("仪表造型对比")} inert={archiveBlocking}>
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
        {u.instrumentVariant !== 'signal' && <button className="instrument-demo" disabled={!hardware.powered || u.instrumentVariant === 'original'}
            aria-pressed={u.instrumentDemo} onClick={() => patch({ instrumentDemo: !u.instrumentDemo })}>
          {u.instrumentDemo ? t("停止演示") : t("动态演示")}
        </button>}
      </div>
      <div className="instrument-comparison-row instrument-description">
        <p>{t(instrumentOptions.find(option => option.id === u.instrumentVariant)?.description || '')}</p>
        <span>{t("旋钮可点击、拖动或滚轮调整 · 中键旋转机身")}</span>
      </div>
    </section>}
    {wordBench && loaded && !failure && <section className="instrument-comparison" aria-label={t("词窗方案对比")} inert={archiveBlocking}>
      <div className="instrument-comparison-row">
        <span className="instrument-comparison-title">{t("词窗试装")}</span>
        <div className="instrument-options" role="group" aria-label={t("选择词窗方案")}>
          {wordDisplayOptions.map(option => <button key={option.id} aria-pressed={u.wordDisplay === option.id}
              onClick={() => selectWordDisplay(option.id)}>{t(option.label)}</button>)}
        </div>
        <div className="instrument-view" role="group" aria-label={t("观察距离")}>
          <button aria-pressed={!wordCloseup} onClick={() => inspectWords(false)}>{t("整机")}</button>
          <button aria-pressed={wordCloseup} onClick={() => inspectWords(true)}>{t("看细节")}</button>
          <label className="word-zoom">
            <span>{t('缩放')}</span>
            <input type="range" min="1" max="4" step="0.05" value={wordZoom} aria-label={t('密码板缩放')}
                onChange={event => zoomWords(Number(event.target.value))}/>
            <output>{wordZoom.toFixed(2)}×</output>
          </label>
        </div>
        <button className="instrument-demo" disabled={!hardware.powered} onClick={() => setBenchWordSet(set => (set + 1) % (benchWords.length + 1))}>{t("换一组词")}</button>
      </div>
      <div className="instrument-comparison-row word-filter-row">
        <span className="instrument-comparison-title">{t('LED 缩放')}</span>
        <div className="instrument-options word-filter-options" role="group" aria-label={t('选择 LED 缩放算法')}>
          {dotFilterOptions.map(option => <button key={option.id} aria-pressed={dotFilter === option.id}
              disabled={u.wordDisplay !== 'led'} onClick={() => selectDotFilter(option.id)}>{t(option.label)}</button>)}
        </div>
      </div>
      <div className="instrument-comparison-row instrument-description">
        <p>{t((u.wordDisplay === 'led' ? dotFilterOptions.find(option => option.id === dotFilter) : wordDisplayOptions.find(option => option.id === u.wordDisplay))?.description || '')}</p>
        <span>{t('切换算法保持词组、配色与距离')}</span>
      </div>
    </section>}
    {hint && !u.archiveOpen && <div className="station-hint" aria-hidden="true">{hint.startsWith('quality:')
        ? qualityHint(hint.slice(8) as QualityChoice) : content.targets.find(target => target.id === hint)?.label}</div>}
    <p className="mobile-hint">{t("横向滑动查看终端 · 下拉纸带查看密报记录")}</p>
    <ArchiveSheet key={`${s.roomCode || 'offline'}:${s.myPlayerID}:${!!preview}`} open={archiveVisible && hardware.powered} locale={u.locale} state={displayState} onClose={closeArchive} onClosed={restoreArchiveFocus}/>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </main>;
}
