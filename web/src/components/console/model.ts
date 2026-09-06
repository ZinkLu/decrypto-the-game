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
    hiddenWords: boolean;
    seconds: number;
}
export const initialLocal: LocalState = {
    mode: 'create', name: '', code: '', clues: ['', '', ''], guess: [0, 0, 0],
    slot: 0, submitted: false, focus: '', note: '', archiveTeam: 'all', archivePage: 0, archiveAnchor: null,
    archiveOpen: false, manual: false, hiddenWords: false, seconds: 0,
};
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
    const people = ['你', 'Alice', 'Bob', 'AI · 01', 'John', 'Lisa', 'AI · 02', 'AI · 03']
        .map((nickname, i) => ({ id: String(i), nickname, is_ai: nickname.startsWith('AI') }));
    const phase = ['home', 'room', 'encrypting', 'intercept', 'decrypt', 'round_result', 'game_over'].includes(name)
        ? name as StationState['phase'] : name === 'waiting' ? 'encrypting' : 'encrypting';
    return { ...base, phase, connected: true, roomCode: phase === 'home' ? null : '5821',
        myPlayerID: '0', ownerID: '0', myTeam: 'A', players: people, teamA: people.slice(0, 4), teamB: people.slice(4), canStart: true,
        round: 5, myRole: name === 'waiting' ? 'teammate' : phase === 'intercept' ? 'opponent' : phase === 'decrypt' ? 'teammate' : 'encryptor',
        myWords: ['灯塔[lighthouse]', '海岸[coast]', '玫瑰[rose]', '候鸟[migratory bird]'],
        secretDigits: [3, 1, 4], secretWords: ['玫瑰', '灯塔', '候鸟'], clues: ['花园', '航行', '羽毛'],
        encryptor: phase === 'intercept' ? 'John' : name === 'waiting' || phase === 'decrypt' ? 'Alice' : '你', waiting: name === 'waiting',
        scoreA: { interceptions: phase === 'game_over' ? 2 : 1, decrypt_failures: 0 }, scoreB: { interceptions: 0, decrypt_failures: 1 },
        history: [
            { round: 1, team: 'A', clues: ['微光', '沙滩', '春天'], secret: [1, 2, 3], decrypt: [1, 2, 3] },
            { round: 2, team: 'B', clues: ['花园', '航行', '羽毛'], secret: [3, 1, 4], decrypt: [3, 1, 4] },
            { round: 3, team: 'A', clues: ['刺', '迁徙', '港口'], secret: [3, 4, 1], intercept: [2, 4, 1], decrypt: [3, 4, 1] },
            { round: 4, team: 'B', clues: ['远行', '潮汐', '花束'], secret: [4, 2, 3], intercept: [4, 2, 3] },
        ], roundResult: phase === 'round_result' ? { intercept_success: false, decrypt_success: true } : null,
        gameOver: phase === 'game_over' ? { winner: 'A' } : null, error: null,
        playerProgress: name === 'waiting' ? { action: 'encrypt', player: 'Alice', state: 'editing', step: 2, total: 3 } : null,
    };
}
