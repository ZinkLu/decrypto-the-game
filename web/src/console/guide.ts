/** Shared by the CRT, accessible transcript and compact terminal. */
export const guideArtUrl = '/images/guide/agents.png';
export const originalGameLinks = [
    { id: 'official', label: '官方网站', href: 'https://www.scorpionmasque.com/en/decrypto' },
    { id: 'bgg', label: 'BGG 游戏介绍', href: 'https://boardgamegeek.com/boardgame/225694/decrypto' },
    { id: 'shop', label: '购买原版桌游', href: 'https://shop.scorpionmasque.com/products/decrypto' },
] as const;
export const guideWords = ['灯塔', '海岸', '玫瑰', '候鸟'];
export const guideSteps = ['看我方密词', '按密码给线索', '对手先猜', '队友后猜'] as const;
/** One idea per page: the lead says it, the diagram shows it, the note adds the rule. */
export const guideLeads = [
    '两队各有四个秘密词，编号 1–4，整局不变。',
    '加密者从软盘读到三位密码，按顺序为每个编号写一条线索。',
    '对手看不到你们的密词，只能拿公开线索对照旧记录。',
    '队友对照我方密词解码：三个编号，顺序全对才算成功。',
] as const;
export const guideNotes = [
    '词窗只有本队看得到。每回合由发报方队员轮流当加密者。',
    '写好三条线索，按 ACTION 发报。',
    '三个编号全猜中就是截获。前两次发报不拦截。',
    '截获后队友照样解码。打满 16 回合按截获减失误定胜负。',
] as const;
/** The guide opens on the page that explains what the table is doing right now. */
export function guidePageFor(phase: string) {
    return phase === 'encrypting' ? 1 : phase === 'intercept' ? 2 : phase === 'decrypt' ? 3 : 0;
}
export const guideOutcome = '截获 2 次胜 · 解码失误 2 次负';
export const guideOpening = '前两次发报不拦截';
export const guideClues = ['花园', '航行', '羽毛'];
export const guideHistory = [
    { code: [1, 2, 3], clues: ['微光', '沙滩', '花束'] },
    { code: [1, 2, 4], clues: ['港口', '潮汐', '迁徙'] },
    { code: [3, 1, 4], clues: ['刺', '光束', '远行'] },
] as const;
export const guideRules = [
    '四个秘密词对应编号 1–4，词窗仅我方可见。',
    '加密者抽到 3·1·4，依次用「花园、航行、羽毛」提示玫瑰、灯塔、候鸟。',
    '线索向双方公开，密码编号保密。图中的编号仅用于说明对应关系。',
    '对手先猜：只能结合公开线索和往轮记录；队友后猜：可以对照我方密词。',
    '同一队的密词整局不变，旧线索和每轮揭晓的密码会留在记录里。',
    '三个编号，顺序全对才成功。',
    '截获两次，或对方解码失误两次，即获胜。',
    '本线上版前两次发报不拦截；截获后队友照样解码。最多 16 回合，打满按截获减失误定胜负。',
] as const;
export const gameIntroduction = '两支队伍传递暗号：让队友从线索中还原密码，同时提防对手从历次记录里摸清规律。';
