import type { useGameStore } from '../../store/gameStore';
export type StationState = ReturnType<typeof useGameStore.getState>;
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
    rosterOpen: boolean;
    hiddenWords: boolean;
    seconds: number;
    diskOut: boolean;
    scopeWave: number;
    scopeRate: number;
    scopeAxis: number;
    backView: boolean;
    batteryOpen: boolean;
    soundOn: boolean;
    powerOn: boolean;
    removedBatteries: number;
    unpluggedCables: number;
    meterAmplitude: number;
    meterRate: number;
    instrumentVariant: InstrumentVariant;
    instrumentDemo: boolean;
}
export const initialLocal: LocalState = {
    // FREQ rests on the engraved 2:1 mark: two locked cycles per sweep.
    locale: 'zh', scopeFreq: 3 / 7,
    mode: 'create', name: '', code: '', clues: ['', '', ''], guess: [0, 0, 0],
    slot: 0, submitted: false, focus: '', note: '', archiveTeam: 'all', archivePage: 0, archiveAnchor: null,
    archiveOpen: false, manual: false, rosterOpen: false, hiddenWords: false, seconds: 0, diskOut: false,
    scopeWave: .5, scopeRate: .9, scopeAxis: 0,
    backView: false, batteryOpen: false, soundOn: false, powerOn: true,
    removedBatteries: 0, unpluggedCables: 0, meterAmplitude: 14, meterRate: 2,
    instrumentVariant: 'signal', instrumentDemo: true,
};
export type HardwareState = Pick<LocalState, 'locale' | 'scopeFreq' | 'diskOut' | 'scopeWave' | 'scopeRate' | 'scopeAxis' | 'backView' | 'batteryOpen' | 'soundOn' | 'powerOn' | 'archiveOpen' | 'manual' | 'removedBatteries' | 'unpluggedCables' | 'meterAmplitude' | 'meterRate' | 'instrumentVariant' | 'instrumentDemo'>;
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
    const color = s.phase === 'intercept' ? '#c8a2ea' : s.phase === 'decrypt' ? '#83c7d1' : '#f1be69';
    return { encrypt, guess, active, ready: active && complete && s.connected, color,
        action: encrypt ? 'encrypt' : s.phase === 'intercept' ? 'intercept' : 'decrypt' };
}
// Presence and progress are public signals; never infer per-player connectivity.
export function rosterTeams(s: StationState, u: LocalState) {
    const playing = ['encrypting', 'intercept', 'decrypt'].includes(s.phase);
    const role = roleState(s, u);
    const everyone = [...s.teamA, ...s.teamB];
    const uniqueName = (name: string) => everyone.filter(p => p.nickname === name).length === 1;
    const sendingTeam = s.myTeam && s.myRole ? s.myRole === 'opponent' ? s.myTeam === 'A' ? 'B' : 'A' : s.myTeam : '';
    const actingTeam = s.phase === 'intercept' ? sendingTeam === 'A' ? 'B' : sendingTeam === 'B' ? 'A' : '' : sendingTeam;
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
    const phase = ['home', 'room', 'encrypting', 'intercept', 'decrypt', 'round_result', 'game_over'].includes(name)
        ? name as StationState['phase'] : name === 'room-empty' || name === 'room-partial' ? 'room' : 'encrypting';
    if (name === 'room-partial') people[0].nickname = locale === 'en' ? 'The mysterious agent still decoding at three in the morning' : '凌晨三点还在破解频道密码的神秘特工';
    const teamA = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(0, 1) : people.slice(0, 4);
    const teamB = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(4, 6) : people.slice(4);
    const playing = phase !== 'home' && phase !== 'room';
    return { ...base, phase, connected: true, roomCode: phase === 'home' ? null : '5821',
        myPlayerID: '0', ownerID: '0', myTeam: teamA.length ? 'A' : '', players: phase === 'home' ? [] : name === 'room-empty' ? people.slice(0, 1) : name === 'room-partial' ? [...teamA, ...teamB, people[1]] : people,
        teamA, teamB, canStart: teamA.length >= 2 && teamB.length >= 2,
        round: playing ? 5 : 0, myRole: !playing ? '' : name === 'waiting' ? 'teammate' : phase === 'intercept' ? 'opponent' : phase === 'decrypt' ? 'teammate' : 'encryptor',
        myWords: phase === 'home' || phase === 'room' ? [] : ['灯塔[lighthouse]', '海岸[coast]', '玫瑰[rose]', '候鸟[migratory bird]'],
        secretDigits: playing ? [3, 1, 4] : [], secretWords: playing ? sample('玫瑰[Rose]', '灯塔[Lighthouse]', '候鸟[Migratory bird]') : [], clues: playing ? sample('花园[Garden]', '航行[Sailing]', '羽毛[Feather]') : [],
        encryptor: !playing ? '' : phase === 'intercept' ? 'John' : name === 'waiting' || phase === 'decrypt' ? 'Alice' : locale === 'en' ? 'You' : '你', waiting: name === 'waiting',
        scoreA: { interceptions: !playing ? 0 : phase === 'game_over' ? 2 : 1, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: playing ? 1 : 0 },
        history: phase === 'home' || phase === 'room' ? [] : [
            { round: 1, team: 'A', clues: sample('微光[Glimmer]', '沙滩[Beach]', '春天[Spring]'), secret: [1, 2, 3], decrypt: [1, 2, 3] },
            { round: 2, team: 'B', clues: sample('花园[Garden]', '航行[Sailing]', '羽毛[Feather]'), secret: [3, 1, 4], decrypt: [3, 1, 4] },
            { round: 3, team: 'A', clues: sample('刺[Thorn]', '迁徙[Migration]', '港口[Port]'), secret: [3, 4, 1], intercept: [2, 4, 1], decrypt: [3, 4, 1] },
            { round: 4, team: 'B', clues: sample('远行[Journey]', '潮汐[Tide]', '花束[Bouquet]'), secret: [4, 2, 3], intercept: [4, 2, 3] },
        ], roundResult: phase === 'round_result' ? { intercept_success: false, decrypt_success: true } : null,
        gameOver: phase === 'game_over' ? { winner: 'A' } : null, error: null,
        playerProgress: name === 'waiting' ? { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, total: 3 } : null,
    };
}
