import type { useGameStore } from '../../store/gameStore';
export type StationState = ReturnType<typeof useGameStore.getState>;
export interface LocalState {
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
    scopeMode: number;
    scopeRate: number;
    scopePersistence: number;
    backView: boolean;
    batteryOpen: boolean;
    soundOn: boolean;
    powerOn: boolean;
    removedBatteries: number;
    unpluggedCables: number;
    meterAmplitude: number;
    meterRate: number;
}
export const initialLocal: LocalState = {
    mode: 'create', name: '', code: '', clues: ['', '', ''], guess: [0, 0, 0],
    slot: 0, submitted: false, focus: '', note: '', archiveTeam: 'all', archivePage: 0, archiveAnchor: null,
    archiveOpen: false, manual: false, rosterOpen: false, hiddenWords: false, seconds: 0, diskOut: false,
    scopeMode: 0, scopeRate: 2, scopePersistence: 1,
    backView: false, batteryOpen: false, soundOn: false, powerOn: true,
    removedBatteries: 0, unpluggedCables: 0, meterAmplitude: 2, meterRate: 2,
};
export type HardwareState = Pick<LocalState, 'diskOut' | 'scopeMode' | 'scopeRate' | 'scopePersistence' | 'backView' | 'batteryOpen' | 'soundOn' | 'powerOn' | 'archiveOpen' | 'manual' | 'removedBatteries' | 'unpluggedCables' | 'meterAmplitude' | 'meterRate'>;
export const scopeModes = ['矢量', '正弦', '双踪', '方波', '三角', '脉冲', '扫频', '噪声'];
export const scopeRates = ['0.5×', '1×', '2×', '4×', '8×'];
export const scopePersistenceModes = ['短余辉', '中余辉', '长余辉', '无限'];
export function nextScopeValue(value: number, length: number, direction = 1) {
    return (value + direction % length + length) % length;
}
export function nextScopeMode(mode: number, direction = 1) {
    return nextScopeValue(mode, scopeModes.length, direction);
}
export const word = (s: string = '') => s.split('[')[0];
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
    const active = (encrypt || guess) && !u.submitted;
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
    const signal = s.playerProgress || s.aiStatus;
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
                    s.phase === 'room' ? '已入席' : !playing ? '待命' : self && u.submitted || reported && 'state' in reported && reported.state === 'submitted' ? '已提交' :
                    acting ? s.phase === 'encrypting' ? '加密中' : s.phase === 'intercept' ? '拦截中' : '解码中' : '监听中';
                return { player, self, owner, encryptor, acting, progress, status, code: `${team}${index + 1}` };
            }),
        };
    });
}
export function archiveRows(s: StationState, team: string) {
    // Never reconstruct a public answer from this player's private secretDigits.
    return s.history.filter(r => (team === 'all' || r.team === team) && r.round < s.round)
        .slice().sort((a, b) => b.round - a.round);
}
export function archiveStart(s: StationState, u: LocalState) {
    const rows = archiveRows(s, u.archiveTeam);
    const anchored = u.archiveAnchor === null ? -1 : rows.findIndex(row => row.round === u.archiveAnchor);
    return anchored >= 0 ? anchored : Math.max(0, Math.min(u.archivePage * 2, rows.length - 1));
}
export function previewState(base: StationState, name: string): StationState {
    if (name === 'late-game') {
        const hints = {
            A: [
                ['微光', '沙滩', '春天', '远行'], ['灯火', '浪花', '花束', '南飞'],
                ['守望', '潮汐', '荆棘', '迁徙'], ['航标', '贝壳', '告白', '羽翼'],
                ['指引', '港湾', '芬芳', '归途'], ['夜航', '礁石', '红瓣', '雁阵'],
                ['光束', '海风', '花园', '越冬'], ['归港', '岸线', '赠礼', '春归'],
            ],
            B: [
                ['刻度', '山巅', '花蜜', '站台'], ['滴答', '冰川', '蜂房', '铁轨'],
                ['齿轮', '雪线', '嗡鸣', '车厢'], ['报时', '攀登', '花粉', '汽笛'],
                ['表盘', '寒峰', '蜂蜡', '卧铺'], ['时针', '白顶', '蜂群', '隧道'],
                ['发条', '雪崩', '酿蜜', '终点'],
            ],
        };
        const codes = [[1, 2, 3], [3, 1, 4], [3, 4, 1], [4, 2, 3], [2, 1, 4], [1, 3, 2]];
        const history = Array.from({ length: 15 }, (_, index) => {
            const round = index + 1;
            const team = index % 2 === 0 ? 'A' : 'B';
            const secret = [...codes[index % codes.length]];
            const wrong = [secret[1], secret[0], secret[2]];
            return { round, team, secret,
                clues: secret.map(digit => hints[team][Math.floor(index / 2)][digit - 1]),
                intercept: round < 3 ? undefined : round === 6 || round === 9 ? [...secret] : [...wrong],
                decrypt: round === 7 || round === 12 ? [...wrong] : [...secret],
            };
        });
        // Both teams are still in play: one interception and one error each.
        return { ...previewState(base, 'intercept'), round: 16, history,
            clues: ['末班', '分秒', '采蜜'], secretDigits: [], secretWords: [],
            scoreA: { interceptions: 1, decrypt_failures: 1 }, scoreB: { interceptions: 1, decrypt_failures: 1 },
        };
    }
    const people = ['你', 'Alice', 'Bob', 'AI · 01', 'John', 'Lisa', 'AI · 02', 'AI · 03']
        .map((nickname, i) => ({ id: String(i), nickname, is_ai: nickname.startsWith('AI') }));
    const phase = ['home', 'room', 'encrypting', 'intercept', 'decrypt', 'round_result', 'game_over'].includes(name)
        ? name as StationState['phase'] : name === 'room-empty' || name === 'room-partial' ? 'room' : 'encrypting';
    if (name === 'room-partial') people[0].nickname = '凌晨三点还在破解频道密码的神秘特工';
    const teamA = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(0, 1) : people.slice(0, 4);
    const teamB = phase === 'home' || name === 'room-empty' ? [] : name === 'room-partial' ? people.slice(4, 6) : people.slice(4);
    const playing = phase !== 'home' && phase !== 'room';
    return { ...base, phase, connected: true, roomCode: phase === 'home' ? null : '5821',
        myPlayerID: '0', ownerID: '0', myTeam: teamA.length ? 'A' : '', players: phase === 'home' ? [] : name === 'room-empty' ? people.slice(0, 1) : name === 'room-partial' ? [...teamA, ...teamB, people[1]] : people,
        teamA, teamB, canStart: teamA.length >= 2 && teamB.length >= 2,
        round: playing ? 5 : 0, myRole: !playing ? '' : name === 'waiting' ? 'teammate' : phase === 'intercept' ? 'opponent' : phase === 'decrypt' ? 'teammate' : 'encryptor',
        myWords: phase === 'home' || phase === 'room' ? [] : ['灯塔[lighthouse]', '海岸[coast]', '玫瑰[rose]', '候鸟[migratory bird]'],
        secretDigits: playing ? [3, 1, 4] : [], secretWords: playing ? ['玫瑰', '灯塔', '候鸟'] : [], clues: playing ? ['花园', '航行', '羽毛'] : [],
        encryptor: !playing ? '' : phase === 'intercept' ? 'John' : name === 'waiting' || phase === 'decrypt' ? 'Alice' : '你', waiting: name === 'waiting',
        scoreA: { interceptions: !playing ? 0 : phase === 'game_over' ? 2 : 1, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: playing ? 1 : 0 },
        history: phase === 'home' || phase === 'room' ? [] : [
            { round: 1, team: 'A', clues: ['微光', '沙滩', '春天'], secret: [1, 2, 3], decrypt: [1, 2, 3] },
            { round: 2, team: 'B', clues: ['花园', '航行', '羽毛'], secret: [3, 1, 4], decrypt: [3, 1, 4] },
            { round: 3, team: 'A', clues: ['刺', '迁徙', '港口'], secret: [3, 4, 1], intercept: [2, 4, 1], decrypt: [3, 4, 1] },
            { round: 4, team: 'B', clues: ['远行', '潮汐', '花束'], secret: [4, 2, 3], intercept: [4, 2, 3] },
        ], roundResult: phase === 'round_result' ? { intercept_success: false, decrypt_success: true } : null,
        gameOver: phase === 'game_over' ? { winner: 'A' } : null, error: null,
        playerProgress: name === 'waiting' ? { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, total: 3 } : null,
    };
}
