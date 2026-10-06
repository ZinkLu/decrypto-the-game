import { roleState, type LocalState, type StationState } from './model';

export type TourAction = 'enter' | 'start' | 'clues' | 'guess' | 'return';
export interface TourContext { home: boolean; words: boolean; voice: boolean; action?: TourAction }
export interface TourStep { id: string; title: string; body: string; mobile: string; target: string; compactTarget: string }

/** Explain an incomplete action too, but never offer input to a waiting seat. */
export function tourAction(s: StationState, u: LocalState): TourAction | undefined {
    if (s.phase === 'home') return 'enter';
    if (s.phase === 'room') return s.ownerID === s.myPlayerID ? 'start' : undefined;
    if (s.phase === 'game_over') return 'return';
    const role = roleState(s, u);
    if (!role.active || !s.connected) return;
    return role.encrypt ? 'clues' : role.guess ? 'guess' : undefined;
}

const actionCopy: Record<TourAction, { title: string; body: string }> = {
    enter: { title: 'ACTION 进入房间', body: '填写代号后，按 ACTION 建立房间；加入已有房间时，还需填写四位房间号。' },
    start: { title: 'ACTION 开始对局', body: '双方队伍各有至少两人后，房主按 ACTION 开始对局。人数不足时按钮不可用。' },
    clues: { title: 'ACTION 提交线索', body: '填完三条线索后，按 ACTION 提交。提交前可以继续修改。' },
    guess: { title: 'ACTION 提交答案', body: '选好三个不重复的编号后，按 ACTION 提交。提交前可以继续修改。' },
    return: { title: 'ACTION 回到房间', body: '对局结束后，按 ACTION 回到房间，准备下一局。' },
};
function actionStep(action: TourAction): TourStep {
    const copy = actionCopy[action];
    return { id: `action-${action}`, ...copy, mobile: copy.body,
        target: '[data-control="transmit"]', compactTarget: '.mobile-action' };
}

/** Only the controls a player can use in the current room belong in the tour. */
export function tourSteps(context: TourContext): TourStep[] {
    if (context.home) return [{ id: 'enter', title: '建立或加入房间',
        body: '填写代号，按 ACTION 建立或加入房间；邀请链接会自动填好房间号。',
        mobile: '填写代号后建立或加入房间；邀请链接会自动填好房间号。',
        target: '[data-control="name"]', compactTarget: '[data-onboarding="enter"]' }, actionStep('enter')];
    return [
        { id: 'room', title: '房间号', body: '右上角显示四位房间号。点击旁边的 COPY 键复制邀请链接，发给朋友加入。',
            mobile: '上方显示四位房间号，可在房间中复制邀请链接给朋友加入。',
            target: '[data-control="copy-code"]', compactTarget: '[data-onboarding="room"]' },
        { id: 'history', title: '查看历史', body: '点击或下拉右侧纸带，查看历轮线索与结果，并在记录板上做笔记。也可以按 H 打开。',
            mobile: '点击「密报记录」，查看历轮线索与结果，并在记录板上做笔记。',
            target: '[data-control="archive-toggle"]', compactTarget: '[data-mobile-archive]' },
        ...context.words ? [{ id: 'words', title: '我方密词', body: '上方四个词窗对应 1–4 号。点击词窗可遮住密词，再点一次显示。',
            mobile: '这里是我方的四个密词与编号。需要时可点击「遮住」，避免旁人看到。',
            target: '[data-control="words"]', compactTarget: '.mobile-words' }] : [],
        ...context.action === 'guess' ? [{ id: 'keypad', title: '数字输入',
            body: '按 1–4 依次输入三个不重复的编号。点击屏幕中的某一位可修改，← 删除。',
            mobile: '点击 1–4 依次输入三个不重复的编号。点击上方某一位可修改，「退格」删除。',
            target: '[data-control^="key-"]', compactTarget: '.mobile-keypad' }] : [],
        ...context.action ? [actionStep(context.action)] : [],
        ...context.voice ? [{ id: 'voice', title: '语音通话', body: '在左上角加入语音、开关麦克风，并切换全桌或本队频道。旁边显示输入电平；猜测时自动分队，加密者保持静音。',
            mobile: '在页面顶部加入语音、开关麦克风，并切换全桌或本队频道。猜测时自动分队，加密者保持静音。',
            target: '.station-voice', compactTarget: '.station-voice' }] : [],
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
