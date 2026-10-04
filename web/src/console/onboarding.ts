export interface TourContext { home: boolean; words: boolean; voice: boolean }
export interface TourStep { id: string; title: string; body: string; mobile: string; target: string; compactTarget: string }

/** Only the controls a player can use in the current room belong in the tour. */
export function tourSteps(context: TourContext): TourStep[] {
    if (context.home) return [{ id: 'enter', title: '建立或加入房间',
        body: '填写代号，按 ACTION 建立房间。已有房间号时，先切换到加入频道。',
        mobile: '填写代号后建立房间；已有房间号时，切换到加入频道。',
        target: '[data-control="name"]', compactTarget: '[data-onboarding="enter"]' }];
    return [
        { id: 'room', title: '房间号', body: '右上角显示四位房间号。点击旁边的 COPY 键复制，发给朋友加入。',
            mobile: '上方显示四位房间号，可在房间中复制给朋友加入。',
            target: '[data-control="copy-code"]', compactTarget: '[data-onboarding="room"]' },
        { id: 'history', title: '查看历史', body: '点击或下拉右侧纸带，查看历轮线索与结果，并在记录板上做笔记。也可以按 H 打开。',
            mobile: '点击「密报记录」，查看历轮线索与结果，并在记录板上做笔记。',
            target: '[data-control="archive-toggle"]', compactTarget: '[data-mobile-archive]' },
        ...context.words ? [{ id: 'words', title: '我方密词', body: '上方四个词窗对应 1–4 号。点击词窗可遮住密词，再点一次显示。',
            mobile: '这里是我方的四个密词与编号。需要时可点击「遮住」，避免旁人看到。',
            target: '[data-control="words"]', compactTarget: '.mobile-words' }] : [],
        ...context.voice ? [{ id: 'voice', title: '语音通话', body: '将右侧对讲旋钮转到 ALL 或 TEAM 加入语音，TALK 控制开麦。猜测时自动分队，加密者保持静音。',
            mobile: '点击「加入语音」，再选择开麦或闭麦。猜测时自动分队，加密者保持静音。',
            target: '[data-control="voice-line"]', compactTarget: '.station-voice' }] : [],
    ];
}

export interface TourProgress { seen: string[]; dismissed: boolean }
const storageKey = 'encrypto-operation-tour-v1';
export function readTourProgress(): TourProgress {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
        return { seen: Array.isArray(value?.seen) ? value.seen.filter((id: unknown) => typeof id === 'string') : [], dismissed: value?.dismissed === true };
    } catch { return { seen: [], dismissed: false }; }
}
export function saveTourProgress(progress: TourProgress) {
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Optional guidance works without storage. */ }
}
