/** Shared by the CRT, accessible transcript and compact terminal. */
export const guideArtUrl = '/images/guide/agents.png';
export const originalGameLinks = [
    { id: 'official', label: '官方网站', href: 'https://www.scorpionmasque.com/en/decrypto' },
    { id: 'bgg', label: 'BGG 游戏介绍', href: 'https://boardgamegeek.com/boardgame/225694/decrypto' },
    { id: 'shop', label: '购买原版桌游', href: 'https://shop.scorpionmasque.com/products/decrypto' },
] as const;
export const guideWords = ['灯塔', '海岸', '玫瑰', '候鸟'];
export const guideSteps = ['看我方密词', '按密码给线索', '对手先猜', '队友后猜'] as const;
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
    '本线上版前两次发报不拦截；截获成功即结束该回合，最多 16 回合。',
] as const;
export const gameIntroduction = '两支队伍传递暗号：让队友从线索中还原密码，同时提防对手从历次记录里摸清规律。';
