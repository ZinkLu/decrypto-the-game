import { translate } from './i18n';
import { guideSteps } from './guide';
import { consoleHardware, hardwareMessage, roleState, keyDiskReadable, keyDiskIdentity, phaseSignal, phaseTitle, teamPalette, themeColors, rosterTeams, resultTint, roundCast } from './model';
import type { LocalState, StationState } from './model';
import type { ScoreSignal } from './scoreFeedback';
import { CREAM, DARK, crtFinish, round, text, type Painter } from './paintKit';
import { paintFront, paintPaper, paintRear, paintRoster, paintScore, paintWords } from './paintFaces';
import { paintScreen } from './paintScreen';

export { crtFinish } from './paintKit';
export { paintClock, knobLabel } from './paintFaces';
/** Page background of the main CRT; the tube shader clears to it between pages. */
export const screenBackground = DARK;

export interface Target {
    id: string;
    label: string;
    surface: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind?: 'input';
    href?: string;
    input?: { fontSize: number; padding: number; placeholder: string };
    value?: string;
    maxLength?: number;
    disabled?: boolean;
}
export interface Frame {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
}
/**
 * A region of the main CRT carrying the terminal's blink attribute, in the screen's
 * logical units. `cursor` is the character blink of a slot someone is working on;
 * `live` is the slow pulse of a link that is up but quiet.
 */
export interface Blink { x: number; y: number; w: number; h: number; kind: 'cursor' | 'live' }
/** The guide's pages, and how many a player can flip through. */
export const guidePages = guideSteps.length;
export interface Content {
    frames: Record<string, Frame>;
    targets: Target[];
    status: string;
    connected: boolean;
    trafficKey: string;
    tint: string;
    waiting: boolean;
    ready: boolean;
    scoreFlags: Record<string, boolean>;
    scoreSignal: ScoreSignal;
    seats: Record<string, string | null>;
    activity: number;
    roomCode: string;
    paperRecords: number;
    paletteKey: string;
    teamPlates: Record<'A' | 'B', string>;
    wordTube: { background: string; light: string; rim: string };
    displayKey: string;
    /** LED die colours of the keyword windows: the keyword itself, and its legends. */
    wordInks: { word: string; legend: string; warning: string };
    wordPrivacyKey: string;
    screenPrivacyKey: string;
    /** The only disk this seat may render; revoked before local animation effects catch up. */
    keyDiskId: string;
    screenBlink: Blink[];
    /** Changes when the terminal starts a new page, which it then writes out line by line. */
    screenPage: string;
    /** Changes when a new transmission arrives, which the tube has to lock onto again. */
    screenSignal: string;
}

export function paint(s: StationState, u: LocalState, inspection = false, guideArt?: HTMLImageElement): Content {
    const h = consoleHardware(u, s);
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    const colors = themeColors(u.theme);
    const frames: Record<string, Frame> = {};
    const targets: Target[] = [];
    const r = roleState(s, u);
    const diskReadable = keyDiskReadable(s, u);
    const keyDiskId = keyDiskIdentity(s);
    const ownsDisk = !!keyDiskId;
    const diskCurrent = ownsDisk && u.keyDisk.id === keyDiskId;
    const signal = phaseSignal(s, u.theme);
    const teams = rosterTeams(s, u);
    const hasGame = !['home', 'room'].includes(s.phase);
    const waiting = hasGame && !r.active && !['round_result', 'game_over'].includes(s.phase);
    // Action colors always identify the acting side, even while this player waits.
    // Phase is already conveyed by the title and the position of the lit lamp.
    const tint = ['round_result', 'game_over'].includes(s.phase) ? resultTint(s) : signal.actingTeam ? signal.color : themeColors(u.theme).own.light;
    function frame(name: string, width: number, height: number, background?: string) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const c = canvas.getContext('2d')!;
        if (background) {
            c.fillStyle = background;
            // The curved mesh owns the CRT silhouette. Transparent texture
            // corners become holes when the barrel warp samples past them.
            if (name === 'screen' || name.startsWith('word')) c.fillRect(0, 0, width, height);
            else { round(c, 0, 0, width, height, 12); c.fill(); }
        }
        frames[name] = { canvas, width, height };
        return c;
    }
    function target(surface: string, id: string, label: string, x: number, y: number, w: number, h: number, options: Partial<Target> = {}) {
        targets.push({ surface, id, label, x, y, w, h, ...options });
        if (inspection && u.focus === id && !options.disabled && !surface.endsWith('Control')) {
            const c = frames[surface].canvas.getContext('2d')!;
            c.strokeStyle = tint;
            c.lineWidth = 3;
            round(c, x + 2, y + 2, w - 4, h - 4, 8);
            c.stroke();
        }
    }
    function button(c: CanvasRenderingContext2D, id: string, label: string, x: number, y: number, w: number, h = 52, disabled = false, selected = false) {
        c.fillStyle = selected ? '#344a51' : '#1e3036';
        round(c, x, y, w, h, 8);
        c.fill();
        text(c, label, x + 18, y + h / 2, 22, disabled ? '#66716e' : selected ? tint : CREAM, 500, w - 30);
        target('screen', id, label, x, y, w, h, { disabled });
    }
    const blink: Blink[] = [];
    const guidePage = Math.max(0, Math.min(guidePages - 1, Math.round(u.guidePage) || 0));
    const p: Painter = { s, u, h, r, t, colors, tint, signal, teams, cast: roundCast(s), hasGame, diskReadable, ownsDisk, diskCurrent, guidePage,
        frames, targets, blink, frame, target, button };
    // Frames and targets keep the order they are painted in: the controls' tab order follows it.
    const screen = paintScreen(p, guideArt), { status, briefing } = screen;
    const dotWords = paintWords(p);
    paintRoster(p);
    const scoreFlags = paintScore(p);
    const records = paintPaper(p);
    const progress = teams.flatMap(team => team.seats).find(seat => seat.acting && seat.progress)?.progress;
    const activity = !hasGame ? 0 : u.submitted ? 1 : r.active ?
        (r.encrypt ? u.clues.filter(value => value.trim()).length : u.guess.filter(Boolean).length) / 3 :
        progress ? Math.max(0, Math.min(1, progress.step / Math.max(1, progress.total))) : 0;
    const ready = paintFront(p);
    const rearControls = paintRear(p);
    const seats: Record<string, string | null> = {};
    teams.forEach(team => team.seats.forEach((seat, i) => { seats[team.team + i] = seat.player?.id ?? null; }));
    screen.overlay();
    for (const name of ['screen', 'word0', 'word1', 'word2', 'word3']) {
        if (dotWords && name !== 'screen') continue;
        const { canvas } = frames[name];
        crtFinish(canvas.getContext('2d')!, canvas.width, canvas.height, name.startsWith('word'));
    }
    if (!h.powered) {
        for (const name of ['screen', 'word0', 'word1', 'word2', 'word3', 'channel']) {
            const { canvas } = frames[name];
            const display = canvas.getContext('2d')!;
            display.setTransform(1, 0, 0, 1, 0, 0);
            display.clearRect(0, 0, canvas.width, canvas.height);
            display.fillStyle = name.startsWith('word') ? dotWords ? '#000' : '#0b1012' : '#0b1313';
            display.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
    const screenPage = !h.powered ? 'off' : !h.online ? 'offline' : u.manual ? `guide:${guidePage}` : u.about ? 'about' :
        briefing ? `brief:${u.brief}` : ['encrypting', 'guess', 'round_result'].includes(s.phase)
            ? `round:${s.round}` : s.phase;
    return { frames, keyDiskId, screenBlink: h.online ? blink : [], screenPage, screenSignal: briefing && h.online ? u.brief : '',
        scoreSignal: { event: s.scoreChange, room: s.roomCode || '', team: s.myRole === 'observer' ? '' : s.myTeam, online: h.online && !s.recovering },
        screenPrivacyKey: `${h.online}:${keyDiskIdentity(s)}:${diskReadable}`, teamPlates: { A: teamPalette('A', s.myTeam, u.theme).plate, B: teamPalette('B', s.myTeam, u.theme).plate }, wordTube: colors.crt, displayKey: u.theme, wordInks: { ...colors.led, warning: colors.led.legend }, wordPrivacyKey: `${h.online}:${s.roomCode}:${s.myTeam}:${hasGame}:${u.hiddenWords}:${s.myWords.join("|")}`, paletteKey: `${u.theme}:${s.myTeam || 'unassigned'}`, connected: h.online, trafficKey: JSON.stringify([s.phase, s.round, s.submitted, s.actions, s.aiStatus, s.playerProgress, s.history.length, s.players]), targets: targets.filter(t => (inspection || rearControls.has(t.id) === u.backView) &&
            (h.powered || rearControls.has(t.id) || ['power-toggle', 'disk-toggle', 'disk-eject'].includes(t.id)) &&
            (h.online || t.surface !== 'screen' || t.id === 'restore-link')),
        status: !h.online ? t(hardwareMessage(u, s)) : status || `${t(phaseTitle(s))} · ${s.connected ? t("已连接") : t("连接中")}`,
        tint, waiting, ready: ready && h.online, scoreFlags, seats, roomCode: h.powered ? h.online ? s.roomCode || '' : '0000' : '',
        paperRecords: records, activity: h.powered ? activity : 0 };
}
