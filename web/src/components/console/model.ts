import type { useGameStore } from '../../store/gameStore';
import type { WordDisplay } from './dotMatrix';
export type StationState = ReturnType<typeof useGameStore.getState>;
export type KeyDiskPhase = 'absent' | 'queued' | 'arriving' | 'inserting' | 'reading' | 'ready' | 'ejecting' | 'ejected' | 'removed' | 'returning' | 'pulling' | 'settling';
export interface KeyDiskState {
    id: string; phase: KeyDiskPhase; startedAt: number;
    pausedAt?: number;
    // 0 = seated, 1 = spring-ejected, 2 = clear of the drive.
    pull?: { amount: number; origin: 'ready' | 'reading' | 'ejected' | 'removed'; target?: 0 | 1 | 2 };
}
export const emptyKeyDisk: KeyDiskState = { id: '', phase: 'absent', startedAt: 0 };
export const keyDiskDurations: Partial<Record<KeyDiskPhase, number>> = { arriving: 1050, returning: 320, inserting: 1195, reading: 420, ejecting: 620, settling: 220 };
export const diskInscriptions = ['top secret', 'credential', 'classified', 'eyes only', 'confidential',
    'restricted', 'black file', 'cipher key', 'no copies', 'burn after use'] as const;
/** Seeded variation keeps the same handwriting through repaints, locale changes and reinsertion. */
export function diskInscription(id: string) {
    let seed = 2166136261;
    for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    return { text: diskInscriptions[seed % diskInscriptions.length], seed,
        tilt: ((seed >>> 8) % 9 - 4) * .012,
        x: (seed >>> 16) % 7 - 3, y: (seed >>> 24) % 5 - 2,
        ink: ['#26374b', '#353933', '#733c31'][seed % 3] };
}
/** A disk belongs to one seat and round. Translated names and phase updates cannot redeliver it. */
export function keyDiskIdentity(s: StationState) {
    return s.myRole === 'encryptor' && ['encrypting', 'intercept', 'decrypt'].includes(s.phase) &&
        s.secretDigits.length === 3 && new Set(s.secretDigits).size === 3 && s.secretDigits.every(n => n >= 1 && n <= 4)
        ? JSON.stringify([s.roomCode, s.myPlayerID, s.myTeam, s.round, s.secretDigits]) : '';
}
export function syncKeyDisk(disk: KeyDiskState, id: string, now: number, available: boolean, reduced: boolean): KeyDiskState {
    if (!id) return disk.phase === 'absent' ? disk : emptyKeyDisk;
    if (disk.id !== id) disk = { id, phase: 'queued', startedAt: now };
    if (disk.phase === 'queued' && available) return { id, phase: reduced ? 'ready' : 'arriving', startedAt: now };
    return disk;
}
export function advanceKeyDisk(disk: KeyDiskState, now: number, reduced = false): KeyDiskState {
    if (disk.pausedAt !== undefined) return disk;
    const duration = keyDiskDurations[disk.phase];
    if (duration === undefined || !reduced && now - disk.startedAt < duration) return disk;
    if (disk.phase === 'settling') return { id: disk.id, phase: disk.pull?.target === 2 ? 'removed' : disk.pull?.target === 1 ? 'ejected' : 'reading', startedAt: now };
    const phase = disk.phase === 'ejecting' ? 'ejected' : reduced || disk.phase === 'reading' ? 'ready' :
        disk.phase === 'arriving' || disk.phase === 'returning' ? 'inserting' : 'reading';
    // Start each physical movement when displayed, even after a background-tab pause.
    return { ...disk, phase, startedAt: now };
}
/** Physical pulling immediately revokes the read head, including a pull that is later cancelled. */
export function pullKeyDisk(disk: KeyDiskState, amount: number, now: number): KeyDiskState {
    if (!Number.isFinite(amount)) return disk;
    const pull = disk.phase === 'pulling' ? disk.pull :
        disk.phase === 'ready' || disk.phase === 'reading' || disk.phase === 'ejected' || disk.phase === 'removed' ? { origin: disk.phase, amount: 0 } : undefined;
    if (!pull) return disk;
    return { ...disk, phase: 'pulling', startedAt: disk.phase === 'pulling' ? disk.startedAt : now,
        pull: { ...pull, amount: Math.max(0, Math.min(2, amount)) } };
}
export function releaseKeyDisk(disk: KeyDiskState, cancelled: boolean, now: number, reduced = false): KeyDiskState {
    if (disk.phase !== 'pulling' || !disk.pull) return disk;
    const target = cancelled ? disk.pull.origin === 'removed' ? 2 : disk.pull.origin === 'ejected' ? 1 : 0 :
        disk.pull.amount >= 1.5 ? 2 : disk.pull.amount >= .5 ? 1 : 0;
    return reduced ? { id: disk.id, phase: target === 2 ? 'removed' : target === 1 ? 'ejected' : 'reading', startedAt: now } :
        { ...disk, phase: 'settling', startedAt: now, pull: { ...disk.pull, target } };
}
export function actKeyDisk(disk: KeyDiskState, eject: boolean, now: number, reduced = false): KeyDiskState {
    if (eject && (disk.phase === 'ready' || disk.phase === 'reading'))
        return { ...disk, phase: reduced ? 'ejected' : 'ejecting', startedAt: now };
    if (!eject && disk.phase === 'ejected')
        return { ...disk, phase: reduced ? 'ready' : 'inserting', startedAt: now };
    if (!eject && disk.phase === 'removed')
        return { ...disk, phase: reduced ? 'ready' : 'returning', startedAt: now };
    return disk;
}
export function keyDiskReadable(s: StationState, u: LocalState) {
    return consoleHardware(u).powered && !u.diskOut && u.keyDisk.phase === 'ready' && !!u.keyDisk.id && u.keyDisk.id === keyDiskIdentity(s);
}
/** Only the read head needs electricity; handling and spring ejection remain mechanical. */
export function syncDiskPower(disk: KeyDiskState, powered: boolean, now: number): KeyDiskState {
    if (!powered && disk.phase === 'ready') return { ...disk, phase: 'reading', startedAt: now, pausedAt: now };
    if (disk.phase !== 'reading') {
        if (disk.pausedAt === undefined) return disk;
        const { pausedAt: _, ...moving } = disk;
        return moving;
    }
    if (!powered) return disk.pausedAt === undefined ? { ...disk, pausedAt: now } : disk;
    if (disk.pausedAt === undefined) return disk;
    const { pausedAt, ...reading } = disk;
    return { ...reading, startedAt: disk.startedAt + now - pausedAt };
}
export function keyDiskMessage(disk: KeyDiskState) {
    return ({ absent: '密钥待分配', queued: '等待接收本轮密钥', arriving: '你的密钥软盘已送达',
        inserting: '正在插入密钥软盘…', reading: '正在读取本轮密钥…', ready: '密钥已读取 · 仅你可见',
        ejecting: '密码已隐藏 · 正在弹出', ejected: '密码已隐藏 · 按住软盘继续向外拖',
        removed: '软盘已取出 · 插回后恢复密码', returning: '正在对齐盘槽…',
        pulling: '密码已隐藏 · 拖动软盘后松手', settling: '软盘正在归位…' })[disk.phase];
}
/** Hardware of the four keyword windows; the DEV bench (`?words=led`) keeps the earlier tubes for comparison. */
export const wordDisplayOptions: { id: WordDisplay; label: string; description: string }[] = [
    { id: 'led', label: 'A · LED 点阵', description: '120×70 双色点阵：关键词使用主题光色，编号和说明使用暖白，底板保持近黑。切换主题先熄灭，再低亮自检、依次载入；过长的词保留全文走字。' },
    { id: 'crt', label: 'B · 滤光小 CRT', description: '四支显像管的暗底、字色与余辉随主题变化，保留扫描线、冷启动预热和关机塌缩。切换主题先熄灭，再显示新配色。' },
];
export type InstrumentVariant = 'original' | 'signal' | 'tuning' | 'status';
export const instrumentOptions: { id: InstrumentVariant; label: string; description: string }[] = [
    { id: 'signal', label: 'A · 调谐接收机', description: 'AUTO 让表针随机摆动，旋钮保持原位。MAN 可手动调谐；右侧调整增益。' },
    { id: 'tuning', label: 'B · 中央归零表', description: '对称刻度与绿色校准区。左侧大旋钮调谐，右侧微调，让指针回到中央。' },
    { id: 'status', label: 'C · 机械状态窗', description: '三面转鼓显示 READY / SEND / WAIT。左侧切换状态，右侧调演示停留时间。' },
    { id: 'original', label: '原版 VU', description: '保留原有 VU 表作为对照。左侧调整摆幅，右侧调整速度。' },
];
export function instrumentSteps(variant: InstrumentVariant, control: 'amplitude' | 'rate') {
    return variant === 'signal' && control === 'amplitude' ? 41 : variant === 'status' && control === 'amplitude' ? 3 :
        variant === 'tuning' && control === 'amplitude' ? 9 : 5;
}
export function stepInstrumentValue(variant: InstrumentVariant, control: 'amplitude' | 'rate', value: number, steps: number) {
    const count = instrumentSteps(variant, control);
    // Receiver knobs have end stops. A frequency sweep must not jump bands.
    return variant === 'status' && control === 'amplitude' ? nextScopeValue(value, count, Math.sign(steps)) : Math.max(0, Math.min(count - 1, value + steps));
}
/** Local receiver toy: three fixed stations, independent of every game/network state. */
export function receiverSignal(tuning: number, gain: number, seconds = 0, lively = true) {
    const position = Math.max(0, Math.min(40, tuning));
    const stations = [[8, 1.75, .70], [21, 1.45, .94], [33, 2.1, .78]];
    let envelope = 0;
    for (const [center, bandwidth, strength] of stations) {
        envelope += strength * Math.exp(-.5 * ((position - center) / bandwidth) ** 2);
    }
    const flutter = lively ? (Math.sin(seconds * 3.7) * .018 + Math.sin(seconds * 8.9 + position) * .008) * envelope : 0;
    const noise = lively ? .005 * Math.sin(seconds * 11.3 + position * .8) : 0;
    const amplification = .35 + Math.max(0, Math.min(4, gain)) * .2525;
    return Math.max(0, Math.min(1, (.026 + envelope + flutter + noise) * amplification));
}
/** Unhurried VU-like phrases with a soft attack, slower release and occasional gaps. */
export class ReceiverActivity {
    level = .12;
    private target = .12;
    private remaining = 0;
    constructor(private random: () => number = Math.random) {}
    advance(seconds: number, running: boolean) {
        if (!running) return this.level;
        let elapsed = Math.max(0, seconds);
        while (elapsed > 0) {
            if (this.remaining < 1e-8) {
                const phrase = this.random();
                this.target = phrase < .14 ? .025 + this.random() * .08 :
                    phrase > .86 ? .82 + this.random() * .15 : .20 + this.random() * .52;
                this.remaining = phrase < .14 ? .8 + this.random() * .7 : .45 + this.random() * .65;
            }
            const step = Math.min(elapsed, this.remaining);
            const response = this.target > this.level ? 7 : 3.5;
            this.level += (this.target - this.level) * (1 - Math.exp(-response * step));
            this.remaining -= step;
            elapsed -= step;
        }
        return this.level;
    }
}
export interface LocalState {
    locale: 'zh' | 'en';
    theme: ThemeId;
    scopeFreq: number;
    mode: 'create' | 'join';
    name: string;
    code: string;
    clues: string[];
    guess: number[];
    slot: number;
    submitted: boolean;
    focus: string;
    note: string;
    archiveTeam: string;
    archivePage: number;
    archiveAnchor: number | null;
    archiveOpen: boolean;
    manual: boolean;
    about: boolean;
    hiddenWords: boolean;
    seconds: number;
    diskOut: boolean;
    keyDisk: KeyDiskState;
    scopeWave: number;
    scopeRate: number;
    scopeAxis: number;
    backView: boolean;
    batteryOpen: boolean;
    soundOn: boolean;
    musicOn: boolean;
    musicVolume: number;
    powerOn: boolean;
    removedBatteries: number;
    unpluggedCables: number;
    meterAmplitude: number;
    meterRate: number;
    instrumentVariant: InstrumentVariant;
    instrumentDemo: boolean;
    wordDisplay: WordDisplay;
    /** The briefing on the main CRT (`briefingKey`), or '' once the working page is up. */
    brief: string;
    guidePage: number;
}
export const initialLocal: LocalState = {
    // FREQ rests on the engraved 2:1 mark: two locked cycles per sweep.
    locale: 'zh', theme: 'classic', scopeFreq: 3 / 7,
    mode: 'create', name: '', code: '', clues: ['', '', ''], guess: [0, 0, 0],
    slot: 0, submitted: false, focus: '', note: '', archiveTeam: 'all', archivePage: 0, archiveAnchor: null,
    archiveOpen: false, manual: false, about: false, hiddenWords: false, seconds: 0, diskOut: false, keyDisk: emptyKeyDisk,
    scopeWave: .5, scopeRate: .9, scopeAxis: 0,
    backView: false, batteryOpen: false, soundOn: true, musicOn: true, musicVolume: .6, powerOn: true,
    removedBatteries: 0, unpluggedCables: 0, meterAmplitude: 14, meterRate: 2,
    instrumentVariant: 'signal', instrumentDemo: true, wordDisplay: 'led', brief: '', guidePage: 0,
};
export type HardwareState = Pick<LocalState, 'locale' | 'scopeFreq' | 'diskOut' | 'keyDisk' | 'scopeWave' | 'scopeRate' | 'scopeAxis' | 'backView' | 'batteryOpen' | 'soundOn' | 'musicOn' | 'powerOn' | 'archiveOpen' | 'manual' | 'removedBatteries' | 'unpluggedCables' | 'meterAmplitude' | 'meterRate' | 'instrumentVariant' | 'instrumentDemo' | 'wordDisplay'>;
/** powerOn is the physical switch, never the derived availability of electricity. */
export function consoleHardware(u: Pick<LocalState, 'powerOn' | 'removedBatteries' | 'unpluggedCables'>,
    connection: { connected: boolean; recovering?: boolean } = { connected: true }) {
    const dc = !(u.unpluggedCables & 4), battery = !(u.removedBatteries & 15);
    const supply = dc ? 'external' : battery ? 'battery' : 'none';
    const powered = u.powerOn && supply !== 'none';
    const linked = !(u.unpluggedCables & 1), aux = !(u.unpluggedCables & 2);
    return { supply, powered, linked, aux, auxAvailable: powered && aux,
        // Illustrative charge for the battery-powered display; no drain simulation yet.
        batteryPercent: powered && supply === 'battery' ? 75 : null,
        online: powered && linked && connection.connected && !connection.recovering };
}
export function hardwareMessage(u: LocalState, s: Pick<StationState, 'connected' | 'recovering'>) {
    const h = consoleHardware(u, s);
    return h.supply === 'none' ? '终端无供电 · 接回 DC 或装齐四节电池' :
        !u.powerOn ? '终端电源已关闭 · 输入已保留' : !h.linked ? '网线已拔出 · 终端脱机 · 对局仍在进行' :
        !h.online ? '接线已连接 · 正在恢复通信' : !h.aux ? 'AUX 已断开 · SIGNAL 无外部输入' :
        h.supply === 'battery' ? '电池供电 · 终端运行正常' : '外部供电 · 终端运行正常';
}
export function hardwareRecovery(u: LocalState) {
    const h = consoleHardware(u);
    return h.supply === 'none' ? { id: 'restore-power', label: '接回电源' } :
        !u.powerOn ? { id: 'restore-switch', label: '开启终端电源' } :
        !h.linked ? { id: 'restore-link', label: '接回网线' } : null;
}
export function draftIdentity(s: StationState) {
    return JSON.stringify([s.roomCode, s.myPlayerID, s.myTeam, s.round, s.phase, s.myRole]);
}
/** A local cable never closes the actual socket. Hold presentation, revoke stale secrets immediately. */
export function terminalView(live: StationState, held: StationState, u: LocalState): StationState {
    if (consoleHardware(u, live).online) return live;
    const sameSeat = live.roomCode === held.roomCode && live.myPlayerID === held.myPlayerID && live.myTeam === held.myTeam;
    const sameKey = sameSeat && !!keyDiskIdentity(live) && keyDiskIdentity(live) === keyDiskIdentity(held);
    return { ...held, connected: live.connected, recovering: live.recovering, error: null, aiNotice: '',
        aiStatus: null, playerProgress: null,
        myWords: sameSeat && live.myWords.join("\0") === held.myWords.join("\0") ? held.myWords : [],
        secretDigits: sameKey ? held.secretDigits : [], secretWords: sameKey ? held.secretWords : [] };
}
export function nextScopeValue(value: number, length: number, direction = 1) {
    return (value + direction % length + length) % length;
}
export const word = (s = '', locale: 'zh' | 'en' = 'zh') => locale === 'en' ? s.match(/\[([^\]]+)\]/)?.[1] || s.split('[')[0] : s.split('[')[0];
// The monitor's four dials. FREQ sets the CAL OUT oscillator as a multiple of
// the sweep reference; its eight engraved marks are calibrated to these
// ratios. WAVE blends between the generator's five engraved shapes. TIME/DIV
// sets the reference itself, and X-Y pans the horizontal amplifier from the
// sweep ramp (0) to the reference sine (a quarter turn).
const clampControl = (value: number) => Math.max(0, Math.min(1, value));
export const scopeModes = ['锯齿', '三角', '正弦', '方波', '脉冲'];
/** Where WAVE points: on an engraved shape, or part of the way between two. */
export function scopeWaveBlend(value: number) {
    const position = clampControl(value) * (scopeModes.length - 1), near = Math.round(position);
    if (Math.abs(position - near) < .08) return { from: near, to: near, mix: 0 };
    const from = Math.floor(position);
    return { from, to: from + 1, mix: position - from };
}
export const scopeMarks: [number, number][] = [[1, 1], [4, 3], [3, 2], [2, 1], [5, 2], [3, 1], [4, 1], [5, 1]];
export function scopeRatio(value: number) {
    const position = clampControl(value) * (scopeMarks.length - 1);
    const index = Math.min(scopeMarks.length - 2, Math.floor(position)), t = position - index;
    // Vernier law: fine travel around each engraved mark, quicker between them.
    const eased = t - .7 * Math.sin(2 * Math.PI * t) / (2 * Math.PI);
    const [p, q] = scopeMarks[index], [nextP, nextQ] = scopeMarks[index + 1];
    return p / q * (nextP * q / (nextQ * p)) ** eased;
}
// Ten divisions per sweep: 200 ms/div fully counter-clockwise, 1.25 ms/div
// fully clockwise. Both oscillators follow, so a figure keeps its shape while
// the beam that writes it slows from a line to a visible moving spot.
export const scopeSweepHz = (value: number) => .5 * 160 ** clampControl(value);
export const scopeTimebase = (value: number) => 1 / (10 * scopeSweepHz(value));
export const scopeAxisAngle = (value: number) => clampControl(value) * Math.PI / 2;
export const scopeFigures = (value: number) => value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0);
export function resultTint(s: StationState) {
    if (s.phase === 'game_over')
        return s.gameOver?.winner === null ? '#b9c5c7' : s.gameOver?.winner === s.myTeam ? '#8bc995' : '#ed9781';
    const result = s.roundResult;
    if (result?.decrypt_success !== undefined)
        return result.decrypt_success ? '#8bc995' : '#ed9781';
    if (result?.intercept_success)
        return s.myRole === 'opponent' ? '#8bc995' : '#ed9781';
    return '#b9c5c7';
}
export function roleState(s: StationState, u: LocalState) {
    const encrypt = s.phase === 'encrypting' && s.myRole === 'encryptor' && !s.waiting;
    const guess = ((s.phase === 'intercept' && s.myRole === 'opponent') ||
        (s.phase === 'decrypt' && s.myRole === 'teammate')) && !s.waiting;
    const active = (encrypt || guess) && !u.submitted && !s.submitted && !s.recovering && (!s.deadline || Date.now() < s.deadline);
    const complete = encrypt ? s.secretDigits.length === 3 && u.clues.every(c => c.trim()) :
        guess && u.guess.every(n => n >= 1 && n <= 4) && new Set(u.guess).size === 3;
    return { encrypt, guess, active, ready: active && complete && s.connected,
        action: encrypt ? 'encrypt' : s.phase === 'intercept' ? 'intercept' : 'decrypt' };
}
const themeBase = {
    device: { light: '#d7cfb8', ink: '#595a4e' },
    warning: { light: '#edbc80', ink: '#8a4c23' },
} as const;
/** Enamel, ink on paper, and luminous type are distinct materials, especially for the white team.
 * Keyword windows use a third device colour shared by both teams, never either team's light. */
export const themeChoices = [
    { ...themeBase, id: 'classic', label: '原版黑白红',
        own: { light: '#e9dfc7', ink: '#383b36', plate: '#efe5cf', onPlate: '#383b36' },
        opponent: { light: '#afc2cc', ink: '#2c3539', plate: '#2c3539', onPlate: '#f2e8d3' },
        crt: { background: '#4a1612', light: '#f1b09d', rim: '#8e493a' },
        led: { word: '#f1b09d', legend: '#d7cfb8' } },
    { ...themeBase, id: 'radio', label: '蓝调电台',
        own: { light: '#a4c7d8', ink: '#365d70', plate: '#365d70', onPlate: '#f2e8d3' },
        opponent: { light: '#e4ae99', ink: '#8a4436', plate: '#8a4436', onPlate: '#f2e8d3' },
        crt: { background: '#292411', light: '#e3cf86', rim: '#6c6342' },
        led: { word: '#e3cf86', legend: '#d7cfb8' } },
    { ...themeBase, id: 'amber', label: '琥珀档案',
        own: { light: '#e5c28b', ink: '#7a542b', plate: '#7a542b', onPlate: '#f2e8d3' },
        opponent: { light: '#a0cac7', ink: '#315f62', plate: '#315f62', onPlate: '#f2e8d3' },
        crt: { background: '#262031', light: '#cbbaed', rim: '#675d7c' },
        led: { word: '#cbbaed', legend: '#d7cfb8' } },
    { ...themeBase, id: 'violet', label: '紫棕密令',
        own: { light: '#cdb6cd', ink: '#674e64', plate: '#674e64', onPlate: '#f2e8d3' },
        opponent: { light: '#bcc99c', ink: '#586244', plate: '#586244', onPlate: '#f2e8d3' },
        crt: { background: '#142731', light: '#9bceec', rim: '#47687c' },
        led: { word: '#9bceec', legend: '#d7cfb8' } },
] as const;
export type ThemeId = typeof themeChoices[number]['id'];
export function themeColors(theme: ThemeId = 'classic') {
    return themeChoices.find(choice => choice.id === theme) ?? themeChoices[0];
}
export function readTheme(): ThemeId {
    try {
        const stored = localStorage.getItem('decrypto-theme');
        const saved = stored === 'rose' ? 'radio' : stored;
        return themeChoices.find(choice => choice.id === saved)?.id ?? 'classic';
    } catch { return 'classic'; }
}
export function saveTheme(theme: ThemeId) {
    try { localStorage.setItem('decrypto-theme', theme); } catch { /* Retain the session choice when storage is blocked. */ }
}
/** Team labels keep their colors before joining; active displays pass no team when idle. */
export function teamPalette(team: string, myTeam: string, theme: ThemeId = 'classic') {
    if (!team) return { light: '#a2a492', ink: '#596457', plate: '#596457', onPlate: '#f2e8d3' };
    const colors = themeColors(theme);
    return team === (myTeam || 'A') ? colors.own : colors.opponent;
}
/** The sending team keeps its role all round; interception hands action to the other team. */
export function phaseSignal(s: StationState, theme: ThemeId = 'classic') {
    const playing = ['encrypting', 'intercept', 'decrypt'].includes(s.phase);
    const participant = ['encryptor', 'teammate', 'opponent'].includes(s.myRole);
    const sendingTeam = s.myTeam && participant ? s.myRole === 'opponent' ? s.myTeam === 'A' ? 'B' : 'A' : s.myTeam : '';
    const actingTeam = !playing ? '' : s.phase === 'intercept' ? sendingTeam === 'A' ? 'B' : sendingTeam === 'B' ? 'A' : '' : sendingTeam;
    const own = !!actingTeam && actingTeam === s.myTeam;
    return { sendingTeam, actingTeam, own, color: teamPalette(actingTeam, s.myTeam, theme).light };
}
/** The three beats of a transmission, in the order the phase panel lights them. */
export const beats = ['encrypting', 'intercept', 'decrypt'] as const;
export type Beat = typeof beats[number];
export const isBeat = (phase: string): phase is Beat => (beats as readonly string[]).includes(phase);
/**
 * Who sends, who intercepts and who decodes this round. Spectators learn the sending
 * team from the encryptor's public name; a nickname shared by two players stays
 * unattributed. The first two transmissions of a game are never intercepted.
 */
export function roundCast(s: StationState) {
    const members = (team: string) => team === 'A' ? s.teamA : team === 'B' ? s.teamB : [];
    const named = [...s.teamA, ...s.teamB].filter(p => p.nickname === s.encryptor);
    const sending = phaseSignal(s).sendingTeam || (named.length === 1 ? s.teamA.includes(named[0]) ? 'A' : 'B' : '');
    const receiving = sending === 'A' ? 'B' : sending === 'B' ? 'A' : '';
    const own = members(sending);
    const encryptor = s.myRole === 'encryptor' ? own.find(p => p.id === s.myPlayerID) :
        own.filter(p => p.nickname === s.encryptor).length === 1 ? own.find(p => p.nickname === s.encryptor) : undefined;
    return { sending, receiving, encryptor, decoders: own.filter(p => p !== encryptor), interceptors: members(receiving),
        intercepted: s.round > 2 };
}
/** Every beat opens with a briefing: the round's cast before the first, the handover before the others. */
export function briefingKey(s: Pick<StationState, 'phase' | 'round' | 'roomCode'>) {
    return isBeat(s.phase) && s.round > 0 ? `${s.roomCode ?? ''}:${s.round}:${s.phase}` : '';
}
export const briefingTime = { round: 3800, handover: 2600 };
export const briefingDuration = (key: string) => key.endsWith(':encrypting') ? briefingTime.round : briefingTime.handover;
export interface SlotSignal { active: boolean; done: boolean; digit: number; match?: boolean }
/**
 * The acting seat's three slots as the other terminals receive them: which one is being
 * worked on, which are filled, and the chosen numbers wherever this seat may see them.
 * Clue text never travels before it is sent. A rival's picks stay hidden from the team
 * that still has to decode; only the round's encryptor, with the disk read, can compare
 * them with the code.
 */
export function transmission(s: StationState, readable = false) {
    if (!isBeat(s.phase)) return null;
    const action = s.phase === 'encrypting' ? 'encrypt' : s.phase;
    const human = s.playerProgress?.action === action ? s.playerProgress : null;
    const ai = s.aiStatus?.action === action ? s.aiStatus : null;
    const thinking = ai && (ai.state === 'thinking' || ai.state === 'retrying') ? ai.step : 0;
    const submitted = human?.state === 'submitted';
    const focus = submitted ? 0 : human?.state === 'editing' && human.focus ? human.focus : thinking;
    const aiDone = ai?.completed ?? 0;
    const showDigits = action !== 'encrypt' && !(action === 'intercept' && s.myRole === 'teammate');
    const slots = [0, 1, 2].map<SlotSignal>(i => {
        const picked = human?.guesses?.[i] ?? 0;
        const done = submitted || (action === 'encrypt'
            ? human ? human.filled ? !!human.filled[i] : i < human.step : i < aiDone
            : human ? picked > 0 : i < aiDone);
        const digit = showDigits && done ? picked : 0;
        return { active: focus === i + 1, done, digit, match: readable && digit > 0 ? digit === s.secretDigits[i] : undefined };
    });
    const player = human?.player && human.player !== 'AI Agent' ? human.player : action === 'encrypt' ? s.encryptor : '';
    return { action, player, ai: !!ai || human?.player === 'AI Agent', retrying: ai?.state === 'retrying',
        slots, count: slots.filter(slot => slot.done).length, started: !!human || !!ai, submitted };
}
// Presence and progress are public signals; never infer per-player connectivity.
export function rosterTeams(s: StationState, u: LocalState) {
    const playing = ['encrypting', 'intercept', 'decrypt'].includes(s.phase);
    const role = roleState(s, u);
    const everyone = [...s.teamA, ...s.teamB];
    const uniqueName = (name: string) => everyone.filter(p => p.nickname === name).length === 1;
    const { sendingTeam, actingTeam } = phaseSignal(s);
    const signal = s.playerProgress || (s.aiStatus ? { ...s.aiStatus, step: s.aiStatus.completed ?? Math.max(0, s.aiStatus.step - 1) } : null);
    const action = s.phase === 'encrypting' ? 'encrypt' : s.phase === 'intercept' ? 'intercept' : 'decrypt';
    return (['A', 'B'] as const).map(team => {
        const people = team === 'A' ? s.teamA : s.teamB;
        const active = playing && team === actingTeam;
        return { team, own: s.myTeam === team, count: people.length,
            summary: s.phase === 'home' ? '尚未接入' : s.phase === 'room' ? people.length >= 2 ? '编组就绪' : `还需 ${2 - people.length} 人` :
                active ? s.phase === 'encrypting' ? '正在加密' : s.phase === 'intercept' ? '正在拦截' : '正在解码' : playing ? '监听频道' : '行动回执',
            seats: Array.from({ length: 4 }, (_, index) => {
                const player = people[index];
                const self = !!player && player.id === s.myPlayerID;
                const owner = !!player && player.id === s.ownerID;
                const encryptor = playing && !!player && (self ? s.myRole === 'encryptor' : team === sendingTeam && player.nickname === s.encryptor && uniqueName(s.encryptor));
                const acting = !!player && active && (s.phase === 'encrypting' ? encryptor : !encryptor);
                const reported = acting && !!player && signal?.action === action && signal.player === player.nickname && uniqueName(player.nickname) ? signal : null;
                const progress = playing && self && (role.active || u.submitted) ? { step: role.encrypt ? u.clues.filter(c => c.trim()).length : u.guess.filter(Boolean).length, total: 3 } : reported;
                const status = !player ? s.phase === 'home' ? '接入后编组' : s.phase === 'room' ? '邀请好友 / AI' : '空席' :
                    player.disconnected ? '离线 · 等待重连' : s.phase === 'room' ? '已入席' : !playing ? '待命' : self && u.submitted || reported && 'state' in reported && reported.state === 'submitted' ? '已提交' :
                    acting ? s.phase === 'encrypting' ? '加密中' : s.phase === 'intercept' ? '拦截中' : '解码中' : '监听中';
                return { player, self, owner, encryptor, acting, progress, status, code: `${team}${index + 1}` };
            }),
        };
    });
}
export function archiveRows(s: StationState, team: string) {
    // Never reconstruct a public answer from this player's private secretDigits.
    return s.history.filter(r => (team === 'all' || r.team === team) && (r.round < s.round || (s.phase === 'game_over' || s.phase === 'round_result') && r.round === s.round && !!r.secret?.length))
        .slice().sort((a, b) => b.round - a.round);
}
export function archiveStart(s: StationState, u: LocalState) {
    const rows = archiveRows(s, u.archiveTeam);
    const anchored = u.archiveAnchor === null ? -1 : rows.findIndex(row => row.round === u.archiveAnchor);
    return anchored >= 0 ? anchored : Math.max(0, Math.min(u.archivePage * 2, rows.length - 1));
}
export function previewState(base: StationState, name: string, locale: 'zh' | 'en' = 'zh'): StationState {
    const sample = (...entries: string[]) => entries.map(value => word(value, locale));
    if (name === 'late-game') {
        const hints = {
            A: [
                ['微光[Glimmer]', '沙滩[Beach]', '春天[Spring]', '远行[Journey]'], ['灯火[Lamplight]', '浪花[Surf]', '花束[Bouquet]', '南飞[Southbound]'],
                ['守望[Watch]', '潮汐[Tide]', '荆棘[Thorns]', '迁徙[Migration]'], ['航标[Beacon]', '贝壳[Shell]', '告白[Confession]', '羽翼[Wings]'],
                ['指引[Guidance]', '港湾[Harbor]', '芬芳[Fragrance]', '归途[Homeward]'], ['夜航[Night sailing]', '礁石[Reef]', '红瓣[Red petals]', '雁阵[Flying geese]'],
                ['光束[Beam]', '海风[Sea breeze]', '花园[Garden]', '越冬[Wintering]'], ['归港[Home port]', '岸线[Shoreline]', '赠礼[Gift]', '春归[Spring return]'],
            ],
            B: [
                ['刻度[Markings]', '山巅[Summit]', '花蜜[Nectar]', '站台[Platform]'], ['滴答[Tick-tock]', '冰川[Glacier]', '蜂房[Hive]', '铁轨[Rails]'],
                ['齿轮[Gears]', '雪线[Snowline]', '嗡鸣[Buzz]', '车厢[Carriage]'], ['报时[Chime]', '攀登[Climbing]', '花粉[Pollen]', '汽笛[Whistle]'],
                ['表盘[Dial]', '寒峰[Icy peak]', '蜂蜡[Beeswax]', '卧铺[Sleeper]'], ['时针[Hour hand]', '白顶[White peak]', '蜂群[Swarm]', '隧道[Tunnel]'],
                ['发条[Mainspring]', '雪崩[Avalanche]', '酿蜜[Honey making]', '终点[Terminus]'],
            ],
        };
        const codes = [[1, 2, 3], [3, 1, 4], [3, 4, 1], [4, 2, 3], [2, 1, 4], [1, 3, 2]];
        const history = Array.from({ length: 15 }, (_, index) => {
            const round = index + 1;
            const team = index % 2 === 0 ? 'A' : 'B';
            const secret = [...codes[index % codes.length]];
            const wrong = [secret[1], secret[0], secret[2]];
            return { round, team, secret,
                clues: secret.map(digit => word(hints[team][Math.floor(index / 2)][digit - 1], locale)),
                intercept: round < 3 ? undefined : round === 6 || round === 9 ? [...secret] : [...wrong],
                decrypt: round === 7 || round === 12 ? [...wrong] : [...secret],
            };
        });
        // Both teams are still in play: one interception and one error each.
        return { ...previewState(base, 'intercept', locale), round: 16, history,
            clues: sample('末班[Last service]', '分秒[Seconds]', '采蜜[Foraging]'), secretDigits: [], secretWords: [],
            scoreA: { interceptions: 1, decrypt_failures: 1 }, scoreB: { interceptions: 1, decrypt_failures: 1 },
        };
    }
    const people = [locale === 'en' ? 'You' : '你', 'Alice', 'Bob', 'AI · 01', 'John', 'Lisa', 'AI · 02', 'AI · 03']
        .map((nickname, i) => ({ id: String(i), nickname, is_ai: nickname.startsWith('AI') }));
    // Watching scenarios show another seat's live progress: `waiting` (teammate) and
    // `listening` (rival) during encryption, `watch-intercept` and `watch-decrypt` (encryptor).
    const watching = { 'watch-intercept': 'intercept', 'watch-decrypt': 'decrypt' }[name];
    const phase = ['home', 'room', 'encrypting', 'intercept', 'decrypt', 'round_result', 'game_over'].includes(name)
        ? name as StationState['phase'] : watching ? watching as StationState['phase'] : name === 'room-empty' || name === 'room-partial' ? 'room' : 'encrypting';
    const you = locale === 'en' ? 'You' : '你';
    const progress: Record<string, StationState['playerProgress']> = {
        waiting: { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, focus: 3, filled: [true, true, false], total: 3 },
        listening: { action: 'encrypt', player: 'John', state: 'editing', step: 1, focus: 2, filled: [true, false, false], total: 3 },
        'watch-intercept': { action: 'intercept', player: 'John', state: 'editing', step: 2, focus: 3, guesses: [2, 1, 0], total: 3 },
        'watch-decrypt': { action: 'decrypt', player: 'Alice', state: 'editing', step: 1, focus: 2, guesses: [3, 0, 0], total: 3 },
    };
    if (name === 'room-partial') people[0].nickname = locale === 'en' ? 'The mysterious agent still decoding at three in the morning' : '凌晨三点还在破解频道密码的神秘特工';
    const teamA = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(0, 1) : people.slice(0, 4);
    const teamB = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(4, 6) : people.slice(4);
    const playing = phase !== 'home' && phase !== 'room';
    return { ...base, phase, connected: true, roomCode: phase === 'home' ? null : '5821',
        myPlayerID: '0', ownerID: '0', myTeam: teamA.length ? 'A' : '', players: phase === 'home' ? [] : name === 'room-empty' ? people.slice(0, 1) : name === 'room-partial' ? [...teamA, ...teamB, people[1]] : people,
        teamA, teamB, canStart: teamA.length >= 2 && teamB.length >= 2,
        round: playing ? 5 : 0, myRole: !playing ? '' : name === 'waiting' ? 'teammate' : name === 'listening' ? 'opponent' : watching ? 'encryptor' :
            phase === 'intercept' ? 'opponent' : phase === 'decrypt' ? 'teammate' : 'encryptor',
        myWords: phase === 'home' || phase === 'room' ? [] : ['灯塔[lighthouse]', '海岸[coast]', '玫瑰[rose]', '候鸟[migratory bird]'],
        secretDigits: playing ? [3, 1, 4] : [], secretWords: playing ? sample('玫瑰[Rose]', '灯塔[Lighthouse]', '候鸟[Migratory bird]') : [], clues: playing ? sample('花园[Garden]', '航行[Sailing]', '羽毛[Feather]') : [],
        encryptor: !playing ? '' : watching ? you : phase === 'intercept' || name === 'listening' ? 'John' : name === 'waiting' || phase === 'decrypt' ? 'Alice' : you,
        waiting: name === 'waiting' || name === 'listening' || !!watching,
        scoreA: { interceptions: !playing ? 0 : phase === 'game_over' ? 2 : 1, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: playing ? 1 : 0 },
        history: phase === 'home' || phase === 'room' ? [] : [
            { round: 1, team: 'A', clues: sample('微光[Glimmer]', '沙滩[Beach]', '春天[Spring]'), secret: [1, 2, 3], decrypt: [1, 2, 3] },
            { round: 2, team: 'B', clues: sample('花园[Garden]', '航行[Sailing]', '羽毛[Feather]'), secret: [3, 1, 4], decrypt: [3, 1, 4] },
            { round: 3, team: 'A', clues: sample('刺[Thorn]', '迁徙[Migration]', '港口[Port]'), secret: [3, 4, 1], intercept: [2, 4, 1], decrypt: [3, 4, 1] },
            { round: 4, team: 'B', clues: sample('远行[Journey]', '潮汐[Tide]', '花束[Bouquet]'), secret: [4, 2, 3], intercept: [4, 2, 3] },
        ], roundResult: phase === 'round_result' ? { intercept_success: false, decrypt_success: true } : null,
        gameOver: phase === 'game_over' ? { winner: 'A' } : null, error: null,
        playerProgress: progress[name] ?? null,
    };
}
