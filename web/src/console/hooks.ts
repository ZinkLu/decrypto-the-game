import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { guideArtUrl } from './guide';
import { advanceKeyDisk, consoleHardware, keyDiskDurations, syncDiskPower, syncDiskPresentation, syncKeyDisk, type KeyDiskState, type LocalState, type StationState } from './model';
import { ConsoleMusic, type MusicPreferences, type MusicStatus } from './music';
import { diskIntroPreview, portable } from './options';
import { ConsoleAudio, type ConsoleSound } from './sound';

export function useReducedMotion() {
    const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const change = () => setReduced(media.matches);
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, []);
    return reduced;
}

/** The guide's illustration, once it has arrived. */
export function useGuideArt() {
    const [art, setArt] = useState<HTMLImageElement>();
    useEffect(() => {
        const image = new Image();
        image.decoding = 'async';
        let mounted = true;
        image.onload = () => { if (mounted) setArt(image); };
        image.src = guideArtUrl;
        return () => { mounted = false; image.onload = null; };
    }, []);
    return art;
}

/** Canvas textures must repaint once the bundled handwriting font arrives. */
export function useDiskFont() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void document.fonts.load('700 52px "Disk Hand"').then(() => {
            if (!cancelled) setReady(true);
        }).catch(() => { /* The local handwriting/cursive fallback remains usable. */ });
        return () => { cancelled = true; };
    }, []);
    return ready;
}

/**
 * The speaker and the music, which live as long as the console. Both channels are
 * unlocked by the first interaction, even while effects are switched off.
 */
export function useConsoleAudio(current: RefObject<{ s: StationState; u: LocalState }>, preferences: RefObject<MusicPreferences>) {
    const audio = useRef<ConsoleAudio | null>(null);
    const music = useRef<ConsoleMusic | null>(null);
    const [musicStatus, setMusicStatus] = useState<MusicStatus>('off');
    useEffect(() => {
        const speaker = new ConsoleAudio();
        const score = new ConsoleMusic(() => speaker.output(), setMusicStatus);
        audio.current = speaker;
        music.current = score;
        speaker.onUnlock = () => { void score.refresh(); };
        speaker.onSound = cue => score.duck(cue);
        speaker.prepare();
        speaker.setEnabled(current.current.u.soundOn);
        score.configure({ ...preferences.current, powered: consoleHardware(current.current.u).powered });
        score.transition(current.current.s, current.current.s);
        const visibility = () => {
            speaker.setVisible(!document.hidden);
            score.configure({ visible: !document.hidden });
        };
        visibility();
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
    /** `gesture` says the player asked for it, which may unlock the speaker. */
    const play = (cue: ConsoleSound, gesture = true) => { void audio.current?.play(cue, gesture); };
    /** After a gesture: the music may start, or try again after it failed to load. */
    const refreshMusic = () => { void audio.current?.unlock().then(() => music.current?.refresh()); };
    return { audio, music, musicStatus, play, refreshMusic };
}

interface DiskOptions {
    disk: KeyDiskState;
    /** The disk this seat holds in the current round, or none. */
    id: string;
    state: StationState;
    loaded: boolean;
    failure: string;
    online: boolean;
    powered: boolean;
    reduced: boolean;
    /** A foreground dialog, including its exit, covers the role introduction. */
    obscured: boolean;
    setLocal: Dispatch<SetStateAction<LocalState>>;
    /** The disk entered another phase. */
    onPhase: () => void;
}
/** The key disk's state machine: delivered once the machine is there, advanced by its timers, paused without power. */
export function useKeyDisk({ disk, id, state, loaded, failure, online, powered, reduced, obscured, setLocal, onPhase }: DiskOptions) {
    const [visible, setVisible] = useState(() => !document.hidden);
    useEffect(() => {
        const change = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', change);
        change();
        return () => document.removeEventListener('visibilitychange', change);
    }, []);
    useLayoutEffect(() => {
        setLocal(old => {
            const next = syncKeyDisk(old.keyDisk, id, performance.now(),
                !document.hidden && !obscured && consoleHardware(old, state).online && (loaded || !!failure || portable()), reduced, state.phase === 'encrypting');
            return next === old.keyDisk ? old : { ...old, keyDisk: next, diskOut: false };
        });
    }, [id, state.phase, loaded, failure, online, reduced, visible, obscured]);
    useLayoutEffect(() => {
        setLocal(old => {
            const now = performance.now();
            const supplied = syncDiskPower(old.keyDisk, consoleHardware(old).powered, now);
            const keyDisk = syncDiskPresentation(supplied, !document.hidden && !obscured && online, now);
            return keyDisk === old.keyDisk ? old : { ...old, keyDisk };
        });
    }, [powered, disk, visible, obscured, online]);
    useEffect(() => {
        const duration = keyDiskDurations[disk.phase];
        if (disk.phase === 'announcing' && diskIntroPreview) return;
        if (duration === undefined || disk.pausedAt !== undefined || disk.phase === 'reading' && !powered) return;
        const timer = window.setTimeout(() => setLocal(old => {
            if (old.keyDisk !== disk) return old;
            const now = performance.now();
            const presented = syncDiskPresentation(disk, !document.hidden && !obscured && online, now);
            const next = advanceKeyDisk(presented, now, reduced);
            return next === disk ? old : { ...old, keyDisk: next, diskOut: ['ejected', 'removed'].includes(next.phase) };
        }), reduced && disk.phase !== 'announcing' ? 0 : Math.max(0, duration - (performance.now() - disk.startedAt)) + 1);
        return () => clearTimeout(timer);
    }, [disk, reduced, powered, obscured, online]);
    useEffect(onPhase, [disk.phase, disk.startedAt, disk.id]);
}
