import { translate, localizeError, readLocale, saveLocale } from './i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { hearing, intercomDeck, setMachine, talk, turnIntercom, useVoice } from '../services/voice';
import { ConsoleEngine } from './engine';
import { gameSound } from './sound';
import { readMusicPreferences, saveMusicPreferences, type MusicPreferences } from './music';
import { consoleHardware, hardwareMessage, hardwareRecovery, terminalView, draftIdentity, initialLocal, roleState, instrumentSteps, stepInstrumentValue, themeColors, readTheme, saveTheme, keyDiskIdentity, keyDiskReadable, keyDiskMessage, actKeyDisk, briefingKey, briefingDuration, roundCast, seatAction, phaseTitle, deadlineWarning, timeoutNotice, warningSeconds, paintedSeconds, readDraft, saveDraft, readName, saveName } from './model';
import { paint, paintClock, knobLabel, guidePages } from './paint';
import { qualityProfiles, settleQuality, readQuality, saveQuality, readAutoQuality, saveAutoQuality } from './quality';
import { reachable } from './actions';
import { isEditingTarget, isNativeKeyTarget, shortcutAction } from './shortcuts';
import ArchiveSheet from './ArchiveSheet';
import Controls, { isKnob, useHandleGrip } from './Controls';
import MobileConsole from './MobileConsole';
import EncryptorIntro from './EncryptorIntro';
import GuideContent from './GuideContent';
import Settings, { qualityHint, qualityLabels } from './Settings';
import Transcript from './Transcript';
import { VoiceNotices } from './VoiceBar';
import StationToast from './StationToast';
import OperationTour from './OperationTour';
import { tourAction } from './onboarding';
import './station-notices.css';
import { InstrumentBench, RosterBench, ScoreBench, WordBench, benchAmplitude, benchState, useBench } from './Workbench';
import { guidePageFor } from './guide';
import { useConsoleAudio, useDiskFont, useGuideArt, useKeyDisk, useReducedMotion } from './hooks';
import { useDiskPull } from './useDiskPull';
import { briefMode, detail, intercomPreview, initialInstrument, initialWordDisplay, inspection, instrumentPreview, keepsMachine, notebookPreview, partialMode, pinnedQuality, portable, preview, route, scoreBench, wordBench } from './options';
import type { LocalState, KeyDiskState } from './model';
import type { Content, Target } from './paint';
import type { QualityChoice, QualityLevel } from './quality';
import { handleSurfaces, type HandleSide } from './view';
import { previewIntercom, turnSelector, type IntercomPosition } from './voice';
export default function Console() {
    const live = useGameStore();
    const [u, setU] = useState<LocalState>(() => { const music = readMusicPreferences(); return { ...initialLocal, name: readName(), musicOn: music.enabled, musicVolume: music.volume, locale: readLocale(), theme: readTheme(), seconds: 90, instrumentVariant: initialInstrument, instrumentDemo: initialInstrument === 'signal', wordDisplay: initialWordDisplay,
        meterAmplitude: benchAmplitude(initialInstrument) }; });
    const bench = useBench();
    const s = useMemo(() => benchState(live, u.locale, bench), [live, bench.people, u.locale, bench.wordSet, bench.scores, bench.scoreChange]);
    const hardware = consoleHardware(u, s);
    const heldState = useRef(s);
    const displayState = useMemo(() => terminalView(s, heldState.current, u), [s, hardware.online]);
    useLayoutEffect(() => { if (hardware.online) heldState.current = s; }, [s, hardware.online]);
    const [staleDraft, setStaleDraft] = useState<{ round: number; text: string } | null>(null);
    const draftContext = useRef(s);
    const hardwareRoom = useRef(s.roomCode);
    const archiveBlocking = u.archiveOpen && hardware.powered;
    const recovery = hardwareRecovery(u);
    const wordCloseup = bench.wordZoom > 1;
    const [loaded, setLoaded] = useState(false);
    const diskFontReady = useDiskFont();
    const guideArt = useGuideArt();
    const reducedMotion = useReducedMotion();
    const [failure, setFailure] = useState('');
    const [archiveVisible, setArchiveVisible] = useState(false);
    const [archiveShown, setArchiveShown] = useState(false);
    const [quality, setQuality] = useState<QualityChoice>(() => pinnedQuality ?? readQuality());
    const [autoLevel, setAutoLevel] = useState<QualityLevel>(() => pinnedQuality ? 'high' : readAutoQuality());
    const [probeRun, setProbeRun] = useState(0);
    const musicPreferences = useMemo(() => ({ enabled: u.musicOn, volume: u.musicVolume }), [u.musicOn, u.musicVolume]);
    const musicPreferencesRef = useRef(musicPreferences);
    musicPreferencesRef.current = musicPreferences;
    const level = quality === 'auto' ? autoLevel : quality;
    const stage = useRef<HTMLDivElement>(null);
    const notices = useRef<HTMLDivElement>(null);
    const engine = useRef<ConsoleEngine | null>(null);
    const previousSoundState = useRef(s);
    const controls = useRef(new Map<string, HTMLElement>());
    // Analog input updates targets and hardware, without repainting all the
    // game screens and the long receipt for each fraction of a knob turn.
    // Otherwise the countdown only repaints its clock.
    // The last seconds of a turn repaint the screen too, for its countdown warning.
    const paintKey = JSON.stringify({ ...u, seconds: paintedSeconds(u.seconds), keyDisk: { ...u.keyDisk, pull: u.keyDisk.pull ? { ...u.keyDisk.pull, amount: 0 } : undefined }, scopeFreq: 0, scopeWave: 0, scopeRate: 0, scopeAxis: 0, meterAmplitude: 0, meterRate: 0 });
    const painted = useMemo(() => paint(displayState, u, inspection, guideArt), [displayState, paintKey, diskFontReady, guideArt]);
    const clock = useMemo(() => paintClock(displayState, u), [displayState, paintKey, u.seconds]);
    const content = useMemo<Content>(() => ({ ...painted, frames: { ...painted.frames, clock }, targets: [...painted.targets, ...Object.keys(handleSurfaces).filter(surface =>
        inspection || surface.includes('Rear') === u.backView).map<Target>(surface => ({
            id: surface, surface, x: 0, y: 0, w: 1, h: 1,
            label: translate(u.locale, surface.includes('Rear') ? '点击把手连接处，回到正面' :
                surface.includes('Left') ? '向右拖动左把手，翻到背面' : '向左拖动右把手，翻到背面'),
        }))].map(target =>
        isKnob(target.id) ? { ...target, label: knobLabel(target.id, u) } : target) }),
        [painted, clock, u.scopeFreq, u.scopeWave, u.scopeRate, u.scopeAxis, u.meterAmplitude, u.meterRate]);
    const current = useRef({ s, u, content, level });
    current.current = { s, u, content, level };
    const pending = useRef(false);
    const progressLast = useRef(0);
    const progressTrail = useRef<number | undefined>(undefined);
    const handleFocusPending = useRef<string | null>(null);
    const archiveFocusPending = useRef(false);
    const [notice, setNotice] = useState('');
    const [tourReplay, setTourReplay] = useState(0);
    const [announcement, setAnnouncement] = useState('');
    const announcedScore = useRef(s.scoreChange?.id);
    const viewKey = draftIdentity(s);
    const diskId = keyDiskIdentity(s);
    const diskReadable = hardware.online && keyDiskReadable(displayState, u);
    const diskPull = useDiskPull({ disk: u.keyDisk, reduced: reducedMotion,
        enabled: !u.backView && !archiveBlocking && !!diskId && u.keyDisk.id === diskId &&
            ['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase),
        axis: () => engine.current?.diskPullAxis() ?? { x: 0, y: 1, pixels: 90 },
        onChange: changeDisk, onClick: () => act('disk-toggle') });
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    const grip = useHandleGrip({ machine: () => engine.current, stage, onTurn: side => turnConsole(true, side),
        onRelease: deliberate => { if (deliberate) setAnnouncement(t('向内拖动把手，即可翻面')); project(); } });
    useEffect(() => { saveLocale(u.locale); document.documentElement.lang = u.locale === 'zh' ? 'zh-CN' : 'en'; document.title = (u.locale === 'zh' ? 'Encrypto - 密报终端' : 'Encrypto') + (inspection ? ' · Preview' : ''); setAnnouncement(translate(u.locale, '语言已切换'));  }, [u.locale]);
    useEffect(() => { saveTheme(u.theme); }, [u.theme]);
    // The intercom shows the voice of the room. Its state is the machine's own, so
    // the targets over it repaint; who is speaking is read by its lamp directly.
    useVoice(v => [v.status, v.whisper, v.micOn, v.holding, v.mode, v.listenOnly, v.machine].join());
    const deck = intercomPreview ? previewIntercom(intercomPreview) : intercomDeck(), deckKey = JSON.stringify(deck);
    useEffect(() => { if (JSON.stringify(current.current.u.intercom) !== deckKey) patch({ intercom: deck }); }, [deckKey]);
    // Without power or its network cable, the console neither speaks nor hears.
    useEffect(() => setMachine(hardware.powered && hardware.linked), [hardware.powered, hardware.linked]);
    function patch(values: Partial<LocalState>) { setU(old => ({ ...old, ...values })); }
    function changeDisk(disk: KeyDiskState) {
        if (disk.id !== keyDiskIdentity(current.current.s)) return;
        setU(old => old.keyDisk.id === disk.id ? { ...old, keyDisk: disk,
            diskOut: ['pulling', 'ejected', 'removed'].includes(disk.phase) || disk.phase === 'settling' && !!disk.pull?.target } : old);
    }
    function facingRear() {
        // A resize can replace a rear-facing 3D machine with the portable terminal.
        if (!keepsMachine && portable()) return false;
        return engine.current?.facingRear() ?? current.current.u.backView;
    }
    function turnConsole(back: boolean, side: HandleSide = 'left') {
        if (document.activeElement?.matches('.station-handle:focus-visible')) {
            handleFocusPending.current = back ? `handleRear${side === 'left' ? 'Left' : 'Right'}TopControl` :
                `handle${side === 'left' ? 'Left' : 'Right'}Control`;
        }
        engine.current?.turnTo(back, side);
        patch({ backView: back, batteryOpen: false, focus: '' });
        setAnnouncement(back ? t('已翻到检修面。可分别控制音乐和音效，或检修电池与灯光。对局继续进行。') : t('已回到操作面，所有输入仍然保留'));
        playSound('handle');
    }
    function chooseQuality(choice: QualityChoice) {
        // Choosing Auto again measures this device afresh, starting from high.
        if (choice === 'auto') { setAutoLevel('high'); saveAutoQuality('high'); setProbeRun(run => run + 1); }
        setQuality(choice);
        saveQuality(choice);
        setAnnouncement(t('画质：{0}', [t(qualityLabels[choice])]));
        setNotice(qualityHint(choice, level, t));
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
    function closeArchive() {
        archiveFocusPending.current = true;
        setAnnouncement(archiveVisible ? t("正在收起记录并撕下小票") : t("已取消打开记录"));
        setArchiveVisible(false);
        patch({ archiveOpen: false });
        if (archiveVisible && (failure || !engine.current || portable())) playSound('paper-tear');
    }
    function restoreArchiveFocus() {
        if (!archiveFocusPending.current || current.current.u.archiveOpen || document.querySelector('.archive-dialog[open]')) return;
        archiveFocusPending.current = false;
        if (portable()) document.querySelector<HTMLButtonElement>('[data-mobile-archive]')?.focus();
        else controls.current.get('paper:archive-toggle')?.focus();
    }
    function tourRegion(id: string) {
        if (id === 'voice') return Array.from(document.querySelectorAll<HTMLElement>('.station-settings .station-voice')).map(node => node.getBoundingClientRect());
        const surfaces = id === 'room' ? ['channel', 'channelCopy'] :
            id === 'keypad' ? ['key0', 'key1', 'key2', 'key3', 'key4'] : id.startsWith('action-') ? ['transmitControl', 'transmitLabel'] :
            id === 'words' ? ['word0', 'word1', 'word2', 'word3'] : id === 'enter' ? ['screen'] : ['paper'];
        const offset = stage.current?.getBoundingClientRect();
        if (!offset || !engine.current || failure) {
            const step = id === 'room' ? 'copy-code' : id === 'history' ? 'archive-toggle' : id === 'words' ? 'words' : id.startsWith('action-') ? 'transmit' : 'name';
            return Array.from(controls.current.values()).filter(node => id === 'keypad' ? node.dataset.control?.startsWith('key-') : node.dataset.control === step).map(node => node.getBoundingClientRect());
        }
        return surfaces.flatMap(surface => {
            const frame = current.current.content.frames[surface];
            if (!frame) return [];
            const bounds = engine.current!.bounds({ id: 'tour-region', label: '', surface, x: 0, y: 0, w: frame.width, h: frame.height });
            return bounds ? [{ ...bounds, left: bounds.left + offset.left, top: bounds.top + offset.top }] : [];
        });
    }
    useEffect(restoreArchiveFocus, [u.archiveOpen]);
    function project() {
        const e = engine.current;
        if (!e)
            return;
        for (const target of current.current.content.targets) {
            const node = controls.current.get(target.surface + ':' + target.id);
            if (grip.held() === target.id) continue;
            const bounds = e.bounds(target);
            // Keep page notices above ACTION as the machine scales with the viewport.
            if (target.id === 'transmit' && bounds && notices.current && stage.current) {
                const bottom = Math.max(18, innerHeight - stage.current.getBoundingClientRect().top - bounds.top + 32);
                notices.current.style.setProperty('--notice-bottom', `${bottom}px`);
            }
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
        if (!preview)
            live.connect();
        return () => { if (!preview)
            useGameStore.getState().disconnect(); };
    }, []);
    const { audio, music, musicStatus, play: playSound, refreshMusic } = useConsoleAudio(current, musicPreferencesRef);
    useEffect(() => {
        let cancelled = false;
        let instance: ConsoleEngine | undefined;
        try {
            instance = new ConsoleEngine(stage.current!, { project, fail: setFailure, inspection, instrumentPreview, partial: partialMode,
                hearing: intercomPreview?.split(',').includes('rx') ? () => Math.max(0, Math.sin(performance.now() / 160)) ** 2 : hearing,
                onPaperPull: () => {
                    if (!cancelled && current.current.u.archiveOpen) {
                        setArchiveVisible(true);
                        setAnnouncement(t("正在拉出纸带并展开密报记录；关闭后撕下小票"));
                    }
                },
                playSound: cue => {
                    if (consoleHardware(current.current.u).powered && (inspection || !portable())) playSound(cue, false);
                },
                setPaperFeed: moving => {
                    void audio.current?.setPaperFeed(moving && consoleHardware(current.current.u).powered &&
                        (inspection || !portable()));
                },
                // A tube still discharges after mains-off; the effects switch still gates it.
                playCrt: event => { if (inspection || !portable()) void audio.current?.crt(event); },
            });
            instance.setQuality(qualityProfiles[current.current.level]);
            engine.current = instance;
            // The performance probes in web/scripts/perf drive the engine through this handle.
            if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__consoleEngine = instance;
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
        return () => {
            cancelled = true;
            instance?.dispose();
            engine.current = null;
            if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__consoleEngine;
        };
    }, []);
    useLayoutEffect(() => { engine.current?.update(content, u); project(); }, [content, loaded]);
    const notebookOpened = useRef(false);
    useEffect(() => {
        if (!notebookPreview || notebookOpened.current || (!loaded && !failure)) return;
        notebookOpened.current = true;
        act('archive-toggle');
    }, [loaded, failure]);
    useLayoutEffect(() => { engine.current?.setKeyDisk(u.keyDisk); project(); }, [u.keyDisk]);
    useLayoutEffect(() => { engine.current?.setQuality(qualityProfiles[level]); }, [level]);
    useLayoutEffect(() => { if (wordBench) engine.current?.setDotFilter(bench.dotFilter); }, [loaded, bench.dotFilter]);
    useLayoutEffect(() => { if (wordBench && loaded) engine.current?.inspectWordScale(bench.wordZoom); }, [loaded, bench.wordZoom]);
    useKeyDisk({ disk: u.keyDisk, id: diskId, state: s, loaded, failure, online: hardware.online, powered: hardware.powered,
        obscured: archiveBlocking || archiveShown,
        reduced: reducedMotion, setLocal: setU, onPhase: () => {
            if (u.keyDisk.id) setAnnouncement(t(u.keyDisk.pausedAt !== undefined ? '读盘暂停 · 等待供电恢复' : keyDiskMessage(u.keyDisk)));
            if (u.keyDisk.phase === 'inserting' && hardware.powered) playSound('disk-in', false);
        } });
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
        // The encryptor gets the disk's role reveal; other seats get the round briefing.
        const brief = briefMode === 'off' || s.myRole === 'encryptor' && s.phase === 'encrypting' && briefMode !== 'hold' ? '' : briefingKey(s);
        // A reload returns to the draft this seat had written in this very beat.
        const draft = preview ? null : readDraft(viewKey);
        setU(old => ({ ...old, clues: draft?.clues ?? ['', '', ''], guess: draft?.guess ?? [0, 0, 0], slot: draft?.slot ?? 0, submitted: false, focus: '', readingClue: null, note: '', manual: false, about: false,
            seconds: preview ? 45 : s.phase === 'encrypting' ? 90 : 60, brief }));
        const cast = roundCast(s);
        setAnnouncement(s.phase === 'home' ? t("通信终端已就绪") : t("第 {0} 回合，{1}", [s.round, s.phase === 'encrypting' || s.phase === 'guess' ? t(phaseTitle(s)) : s.phase === 'room' ? t("队伍准备") : t("阶段更新")]) +
            (brief && cast.sending ? ` · ${t('{0} 队发报', [cast.sending])}${s.encryptor ? ` · ${t('加密者 {0}', [s.encryptor])}` : ''}` : ''));
    }, [viewKey]);
    useEffect(() => {
        if (!u.brief || briefMode === 'hold') return;
        const brief = u.brief;
        const timer = window.setTimeout(() => setU(old => old.brief === brief ? { ...old, brief: '' } : old), briefingDuration(brief));
        return () => clearTimeout(timer);
    }, [u.brief]);
    useEffect(() => {
        if (preview) return;
        // Polled four times a second, but the console re-renders only when the second changes.
        const update = () => setU(old => {
            const seconds = s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : 0;
            return seconds === old.seconds ? old : { ...old, seconds };
        });
        update();
        if (!s.deadline) return;
        const timer = window.setInterval(update, 250);
        return () => clearInterval(timer);
    }, [s.deadline, viewKey]);
    useEffect(() => { if (!s.recovering) patch({ submitted: s.submitted }); }, [s.submitted, s.recovering]);
    useEffect(() => {
        // The acting seat hears its time running out: a call at 15 s, then a tick each second from 5.
        const warning = deadlineWarning(s, u, u.seconds);
        if (!warning || !consoleHardware(u, s).online || u.seconds <= 0) return;
        if (u.seconds === warningSeconds) { playSound('turn', false); setAnnouncement(t(...warning)); }
        else if (u.seconds <= 5) playSound('key', false);
    }, [u.seconds]);
    const settled = timeoutNotice(s);
    useEffect(() => {
        const event = s.scoreChange, before = announcedScore.current;
        announcedScore.current = event?.id;
        if (!event || event.id === before || !hardware.online || s.recovering || Date.now() - event.at > 1500) return;
        setAnnouncement(event.changes.map(change => t(change.kind === 'intercept' ? '{0} 队截获 +1 · 累计 {1} / 2' : '{0} 队失误 +1 · 累计 {1} / 2', [change.team, change.total])).join('；'));
    }, [s.scoreChange, hardware.online]);
    useEffect(() => { if (settled) setAnnouncement(t(...settled)); }, [settled?.[0], s.timeouts.length]);
    useEffect(() => { if (!preview) saveDraft(viewKey, { clues: u.clues, guess: u.guess, slot: u.slot }); }, [u.clues, u.guess, u.slot]);
    useEffect(() => { saveName(u.name); }, [u.name]);
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
        setNotice(localizeError(u.locale, s.error));
        if (consoleHardware(current.current.u, current.current.s).online) playSound('error', false);
    } }, [s.error]);
    useEffect(() => { pending.current = false; }, [s.teamA, s.teamB, s.roomCode]);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const local = current.current.u;
            const command = shortcutAction(event, {
                editing: isEditingTarget(event.target), nativeControl: isNativeKeyTarget(event.target),
                submitInput: event.target instanceof Element && event.target.hasAttribute('data-console-input'),
                manual: local.manual, briefing: !!local.brief && !failure && !portable(),
            });
            if (!command || document.querySelector('.archive-dialog[open]')) return;
            if (local.archiveOpen && consoleHardware(local).powered) {
                if (command === 'dismiss' || command === 'archive-toggle') { event.preventDefault(); closeArchive(); }
                return;
            }
            const help = document.querySelector<HTMLDetailsElement>('#station-shortcuts');
            const preferences = document.querySelector<HTMLDetailsElement>('#station-preferences');
            const closePanel = (panel: HTMLDetailsElement) => {
                panel.open = false;
                panel.querySelector('summary')?.focus({ preventScroll: true });
            };
            if (command === 'shortcuts' && help) {
                event.preventDefault();
                if (preferences) preferences.open = false;
                help.open = !help.open;
                help.querySelector('summary')?.focus({ preventScroll: true });
                if (help.open) help.querySelector('summary')?.scrollIntoView({ block: 'nearest' });
                return;
            }
            // Page panels own focus; no game actions leak through while reading them.
            const panel = help?.open ? help : preferences?.open ? preferences : null;
            if (panel) {
                if (command === 'dismiss') { event.preventDefault(); closePanel(panel); }
                return;
            }
            if (command === 'dismiss') {
                if (!grip.cancel()) {
                    if (local.manual || local.about)
                        handleFocusPending.current = local.about ? 'about' : 'manual';
                    else skipBriefing();
                    patch({ archiveOpen: false, manual: false, about: false });
                }
                event.preventDefault();
                return;
            }
            if (!consoleHardware(local).powered || facingRear()) return;
            if ((local.manual || local.about) && !['manual', 'archive-toggle'].includes(command) && !command.startsWith('guide-')) return;
            event.preventDefault();
            act(command);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });
    function skipBriefing() {
        if (!current.current.u.brief) return;
        current.current.u = { ...current.current.u, brief: '' };
        setU(old => old.brief ? { ...old, brief: '' } : old);
    }
    function turnGuide(page: number) {
        const next = Math.max(0, Math.min(guidePages - 1, page));
        if (next === current.current.u.guidePage) return;
        current.current.u = { ...current.current.u, guidePage: next };
        patch({ guidePage: next });
        playSound('key');
    }
    function progress(clues: string[], guess: number[], slot: number, force = false, focusing = false) {
        const now = performance.now();
        clearTimeout(progressTrail.current);
        if (!force && now - progressLast.current < 180) {
            // The last change inside the window still goes out once it closes.
            progressTrail.current = window.setTimeout(() => progress(clues, guess, slot, true, focusing), 180 - (now - progressLast.current));
            return;
        }
        progressLast.current = now;
        const state = current.current.s;
        const local = current.current.u;
        const r = roleState(state, local);
        if (preview || !consoleHardware(local, state).online || !r.active)
            return;
        // Other seats learn which lines hold a clue, never the clue itself. The draft goes to the
        // server alone, which sends it if time runs out.
        const chosen = r.guess && guess.every(Boolean);
        state.sendProgress(r.action, r.encrypt ? clues.filter(c => c.trim()).length : guess.filter(Boolean).length,
            { state: 'editing', focus: chosen && !focusing ? 0 : slot + 1, ...(r.guess ? { guesses: guess } : { filled: clues.map(c => !!c.trim()), clues }) });
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
        refreshMusic();
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
        setAnnouncement(message ? `${message} · ${translate(next.locale, hardwareMessage(next, current.current.s))}` :
            translate(next.locale, hardwareMessage(next, current.current.s)));
    }
    function act(id: string) {
        const { s: state, u: local } = current.current;
        const r = roleState(state, local);
        if (!reachable(id, { powered: consoleHardware(local).powered, online: consoleHardware(local, state).online, rear: facingRear(),
            batteryOpen: local.batteryOpen, pending: pending.current, briefing: !!local.brief && !failure && !portable() })) return;
        if (id in handleSurfaces) {
            turnConsole(!id.includes('Rear'), id.includes('Left') ? 'left' : 'right');
            return;
        }
        if (id.startsWith('voice-line')) {
            const now = intercomDeck().selector;
            const next: IntercomPosition = id === 'voice-line' ? turnSelector(now, 'click') : id === 'voice-line-next' ? turnSelector(now, 1) :
                id === 'voice-line-prev' ? turnSelector(now, -1) : id === 'voice-line-off' ? 'off' : 'team';
            if (next === now) return;
            turnIntercom(next);
            playSound('switch');
            return;
        }
        if (id.startsWith('voice-talk')) {
            const event = id === 'voice-talk' ? 'click' : id === 'voice-talk-down' ? 'down' : 'up';
            // A click latches the key in toggle mode; in hold mode the stroke starts when it goes down.
            if (event === (useVoice.getState().mode === 'toggle' ? 'click' : 'down')) playSound('key');
            talk(event);
            return;
        }
        if (id.startsWith('read-clue-')) {
            const clue = Number(id.slice(-1));
            patch({ readingClue: local.readingClue === clue ? null : clue });
            playSound('key');
            return;
        }
        if (id === 'restore-power' || id === 'restore-link') {
            changeHardware({ unpluggedCables: local.unpluggedCables & ~(id === 'restore-power' ? 4 : 1) });
            return;
        }
        if (id === 'power-toggle' || id === 'restore-switch') {
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
        if (id === 'battery-toggle') {
            patch({ batteryOpen: !local.batteryOpen });
            setAnnouncement(local.batteryOpen ? t("电池仓已合上") : t("电池仓已打开，四节电池与金属触点可见。再次点击电池仓合上。"));
            playSound('latch');
            return;
        }
        if (id.startsWith('battery-cell-')) {
            const index = Number(id.slice(-1));
            const removedBatteries = local.removedBatteries ^ (1 << index);
            changeHardware({ removedBatteries }, t("第 {0} 节电池已{1}", [index + 1, removedBatteries & (1 << index) ? t("取出，再次点击装回") : t("装回")]));
            return;
        }
        if (id.startsWith('cable-plug-')) {
            const index = Number(id.slice(-1));
            changeHardware({ unpluggedCables: local.unpluggedCables ^ (1 << index) },
                t('{0}已{1}', [[t('网线'), t('串口线'), t('电源线')][index], local.unpluggedCables & (1 << index) ? t('插回') : t('拔出')]));
            return;
        }
        if (id === 'lamp-test') {
            engine.current?.testLamps();
            playSound('test');
            setAnnouncement(t("本机指示灯自检中，未改变对局或网络连接"));
            return;
        }
        // ACTION during a briefing only takes the operator to the working page. The
        // portable terminal has no briefing page, so there it always transmits.
        if (id === 'transmit' && local.brief && !failure && !portable()) {
            skipBriefing();
            engine.current?.pulse(id);
            playSound('key');
            return;
        }
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
        if (id === 'brief-skip') {
            skipBriefing();
            playSound('key');
            return;
        }
        if (id === 'manual' || id === 'about' || id === 'screen-close' || id === 'guide-done') {
            if (id === 'screen-close' || id === 'guide-done') handleFocusPending.current = local.about ? 'about' : 'manual';
            // The guide opens on the page for what the table is doing right now.
            patch({ manual: id === 'manual' && !local.manual, about: id === 'about' && !local.about, focus: '',
                ...(id === 'manual' && !local.manual ? { guidePage: guidePageFor(state.phase, seatAction(state)) } : {}) });
            playSound('key');
            return;
        }
        if (id === 'guide-prev' || id === 'guide-next' || id.startsWith('guide-page-')) {
            turnGuide(id === 'guide-prev' ? local.guidePage - 1 : id === 'guide-next' ? local.guidePage + 1 : Number(id.slice(11)));
            return;
        }
        if (local.manual && id.startsWith('key-')) {
            const n = Number(id.slice(4));
            engine.current?.pulse(id);
            turnGuide(n === 4 ? local.guidePage - 1 : n);
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
                if (local.archiveOpen) return;
            patch({ archiveOpen: true });
            setAnnouncement(t("正在拉出纸带并展开密报记录"));
            if (failure || !engine.current || portable()) {
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
                return;
        }
        if (id.startsWith('scope-')) {
            adjustKnob(id.replace('-prev', '').replace('scope-prev', 'scope-tune'), id.endsWith('-prev') || id === 'scope-prev' ? -1 : 1, true);
            return;
        }
        if (id === 'leave-room') {
            playSound('key');
            state.reset();
            state.connect();
            return;
        }
        if (id === 'copy-code') {
            if (state.roomCode) playSound('key');
            engine.current?.pulse('copy-code');
            if (state.roomCode)
                navigator.clipboard?.writeText(state.roomCode).then(() => setNotice(t('频道编号已复制。'))).catch(() => setNotice(t('频道编号：{0}', [state.roomCode])));
            if (state.roomCode && !navigator.clipboard) setNotice(t('频道编号：{0}', [state.roomCode]));
            return;
        }
        if (id.startsWith('slot-')) {
            if (r.active) {
                patch({ slot: Number(id.slice(5)) });
                progress(local.clues, local.guess, Number(id.slice(5)), true, true);
            }
            return;
        }
        if (id.startsWith('key-')) {
            if (local.brief) skipBriefing();
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
                patch({ note: '正在回到房间…' });
                state.returnToRoom();
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
                else if (r.action === 'intercept')
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
    const colors = themeColors(u.theme);
    // The first status line already names the supply when the terminal is healthy.
    const supplyLabel = hardware.supply === 'external' ? '外部供电' : hardware.supply === 'battery' ? '电池供电' : '无供电';
    const statusMessage = hardwareMessage(u, s);
    return <main style={{ '--guide-accent': colors.own.light, '--team-own': colors.own.ink, '--team-opponent': colors.opponent.ink, '--device-ink': colors.device.ink } as CSSProperties} data-theme={u.theme} className={`station ${failure ? 'station-fallback' : ''}`} data-view={route.view} data-power={hardware.powered ? 'on' : 'off'} data-supply={hardware.supply} data-link={hardware.online ? 'online' : 'offline'} data-aux={hardware.auxAvailable ? 'on' : 'off'}
        data-backdrop-blur={qualityProfiles[level].backdropBlur ? undefined : 'off'}
        data-instruments={instrumentPreview || wordBench || undefined} data-instrument={instrumentPreview ? u.instrumentVariant : undefined}
        data-word-bench={wordBench || undefined}
        data-detail={(instrumentPreview ? bench.instrumentCloseup ? 'meter' : null : wordBench ? wordCloseup ? 'words' : null : detail) || undefined}>
    <Settings t={t} inspection={inspection} failed={!!failure} inert={archiveBlocking} quality={quality} level={level} theme={u.theme} locale={u.locale}
        soundOn={u.soundOn} music={musicPreferences} musicStatus={musicStatus} powered={hardware.powered}
        onQuality={chooseQuality} onTour={() => {
            if (u.backView) turnConsole(false);
            patch({ manual: false, about: false });
            setTourReplay(value => value + 1);
        }} onAct={act} onLocale={locale => patch({ locale })}
        onTheme={(theme, label) => { patch({ theme }); setAnnouncement(t('主题已切换为{0}', [t(label)])); }}
        onVolume={volume => changeMusic({ volume })} onRetryMusic={refreshMusic}/>
    <h1 className="sr-only">{t("Encrypto · 密报终端")}</h1>
    {hardware.online && diskId && u.keyDisk.id === diskId && u.keyDisk.phase === 'announcing' &&
        <EncryptorIntro key={diskId} disk={u.keyDisk} round={s.round} locale={u.locale} reduced={reducedMotion}/>}
    <MobileConsole state={displayState} local={u} ready={content.ready} status={content.status} onAct={act} onChange={(id, value) => change({ id }, value)} onDiskChange={changeDisk} reducedMotion={reducedMotion} inert={archiveBlocking}/>
    <div className="station-viewport" inert={archiveBlocking}>
      <div className="station-stage" ref={stage}>
        {!loaded && !failure && <div className="station-loading"><strong>ENCRYPTO</strong><span>{t("正在启动密码终端…")}</span></div>}
        {failure && <div className="station-error" role="alert">{t(failure)}<button onClick={() => location.reload()}>{t("重新载入")}</button></div>}
        <div className="sr-only">{(u.manual || u.about) && <GuideContent locale={u.locale} about={u.about} transcript/>}</div>
        <Controls targets={content.targets} local={u} failed={!!failure} visible={loaded || !!failure} t={t} nodes={controls} diskPull={diskPull} grip={grip}
            onAct={act} onChange={(target, value) => change(target, value)} onKnob={adjustKnob}
            onFocus={target => { patch({ focus: target.id }); if (target.id.startsWith('clue-'))
                progress(u.clues, u.guess, Number(target.id.slice(5)), true); }}
            onBlur={target => { if (current.current.u.focus === target.id)
                patch({ focus: '' }); }}/>
        <Transcript state={displayState} local={u} hardware={hardware} status={content.status} diskReadable={diskReadable} failed={!!failure} t={t}/>
      </div>
    </div>
    {loaded && !failure && <div className="station-workbench" inert={archiveBlocking}>
      {inspection && !scoreBench && <span className="station-orbit-hint">{t(inspection ? '拖动机身旋转 · 滚轮缩放 · 拖动把手翻面' : u.backView ? '点击把手连接处，回到正面' : '向内拖动把手，即可翻面')}</span>}
      {inspection && <button className="station-reset-view" onClick={() => engine.current?.resetInspection()}>{t('重置视角')}</button>}
      {scoreBench && !u.backView && <ScoreBench bench={bench} powered={hardware.powered} t={t}/>}
      {preview === 'roster-motion' && !u.backView && <RosterBench bench={bench} t={t}/>}
    </div>}
    <div className="station-notices" ref={notices} hidden={archiveBlocking} inert={archiveBlocking}>
    {(u.backView || !hardware.online || staleDraft) && <aside className="station-notice station-hardware-status" aria-label={t('终端状态')}>
      <p role="status">{t(statusMessage)}</p>
      <p className="hardware-match">{u.backView && !statusMessage.includes(supplyLabel) && <>{t(supplyLabel)} · </>}{s.phase === 'home' ? t('尚未接入频道') : s.phase === 'room' ? t('队伍准备中') :
          s.phase === 'game_over' ? t('行动结束') : statusMessage.includes('对局仍在进行') ? t('当前第 {0} 回合', [s.round]) : t('第 {0} 回合 · 对局仍在进行', [s.round])}</p>
      {recovery && <button type="button" data-hardware-recovery={recovery.id} onClick={() => act(recovery.id)}>{t(recovery.label)}</button>}
      {u.backView && hardware.powered && !hardware.aux && hardwareRecovery(u) && <p>{t('AUX 已断开 · SIGNAL 无外部输入')}</p>}
      {staleDraft && <details><summary>{t('旧草稿 · 第 {0} 回合', [staleDraft.round])}</summary><p>{staleDraft.text}</p><small>{t('仅供查看，不会自动提交')}</small></details>}
    </aside>}
    <VoiceNotices t={t}/>
    {notice && <StationToast message={notice} t={t} onClose={() => setNotice('')}/>}
    {!keepsMachine && <OperationTour home={s.phase === 'home'} words={!!s.myWords.length} compactWords={!roleState(displayState, u).encrypt} voice={!!live.voice && !!live.roomCode}
        action={tourAction(displayState, u)} briefing={!!u.brief && !failure}
        enabled={(loaded || !!failure) && hardware.online && !u.backView && !archiveBlocking && !u.manual && !u.about && !notice && u.keyDisk.phase !== 'announcing'}
        autoStart={!preview || new URLSearchParams(location.search).has('tour')} persist={!preview} replay={tourReplay} measureRegion={tourRegion} t={t}/>}
    </div>
    {instrumentPreview && loaded && !failure && <InstrumentBench bench={bench} local={u} powered={hardware.powered} inert={archiveBlocking} t={t}
        onPatch={patch} announce={setAnnouncement} onHint={id => { if (id) setNotice(content.targets.find(target => target.id === id)?.label || ''); }} onInspect={closeup => engine.current?.inspectInstrument(closeup)}/>}
    {wordBench && loaded && !failure && <WordBench bench={bench} local={u} powered={hardware.powered} inert={archiveBlocking} t={t}
        onPatch={patch} announce={setAnnouncement}/>}
    <p className="mobile-hint">{t("横向滑动查看终端 · 下拉纸带查看密报记录")}</p>
    <ArchiveSheet key={`${s.roomCode || 'offline'}:${s.myPlayerID}:${s.myTeam}:${!!preview}`} open={archiveVisible && hardware.powered} locale={u.locale} state={displayState} onClose={closeArchive} onClosed={restoreArchiveFocus} onVisibilityChange={setArchiveShown}/>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </main>;
}
