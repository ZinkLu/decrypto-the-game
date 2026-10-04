/**
 * When voices carry, as at a real table: everyone hears what is said aloud,
 * and teammates may lean in and whisper. While the code is being guessed,
 * each team talks apart until the reveal, and the encryptor keeps quiet. The
 * server makes sure a team's channel never reaches anyone else; these rules
 * decide when each channel is open, on both the speaking and the hearing side.
 */
export type VoiceChannel = 'table' | 'team';
export type VoiceMode = 'toggle' | 'hold';

/** What the rules need to know of the game, as this page sees it. */
export interface VoiceView {
    phase: string;
    role: string;
    /** "A", "B", or "" for a player who watches. */
    team: string;
    /** The player ID of this round's encryptor, if any. */
    encryptor: string;
}

/** Teams talk apart while they guess: from the end of encryption until the reveal. */
export function apart(view: VoiceView): boolean {
    return view.phase === 'guess';
}

/** Where this player's voice goes, or null while they must keep quiet. */
export function speakingTo(view: VoiceView, whisper: boolean): VoiceChannel | null {
    if (apart(view)) return view.team && view.role !== 'encryptor' ? 'team' : null;
    return whisper && view.team ? 'team' : 'table';
}

/** Whether this player hears what a speaker says on a channel. */
export function audible(view: VoiceView, channel: VoiceChannel, speaker: string): boolean {
    if (!apart(view)) return true;
    return channel === 'team' && speaker !== view.encryptor;
}

/** The line under the voice controls. */
export function voiceStatus(view: VoiceView, whisper: boolean): string {
    if (apart(view)) {
        if (!view.team) return '分组讨论 · 观战席暂时静音';
        return view.role === 'encryptor' ? '分组讨论 · 你是加密者，请保持安静' : '分组讨论 · 只有队友听得到';
    }
    return whisper && view.team ? '悄悄话 · 只有队友听得到' : '全桌通话';
}

/** What to tell the player when the table splits or comes back together. */
export function voiceTurn(before: VoiceView, after: VoiceView): string | null {
    if (apart(before) === apart(after)) return null;
    if (!apart(after)) return '回到全桌通话';
    if (!after.team) return '开始分组讨论：观战席暂时静音';
    return after.role === 'encryptor' ? '开始分组讨论：加密者请保持安静' : '开始分组讨论：只听得到队友';
}

/** Where the intercom's selector stands: off the line, talking to the table, or to the team. */
export type IntercomPosition = 'off' | 'all' | 'team';
export const intercomPositions: IntercomPosition[] = ['off', 'all', 'team'];

/**
 * What the intercom on the console shows. Who is speaking is left out: it
 * changes many times a second, and the lamp that shows it reads the sound itself.
 */
export interface IntercomDeck {
    /** The server offers voice in this room. */
    available: boolean;
    line: 'off' | 'connecting' | 'on';
    selector: IntercomPosition;
    /** Where this seat's voice goes when it talks, or null while it must keep quiet. */
    route: VoiceChannel | null;
    /** The TALK key is down: latched in toggle mode, held in hold mode. */
    open: boolean;
    mode: VoiceMode;
    /** Without a microphone the key does nothing. */
    listenOnly: boolean;
}

/**
 * The selector's next detent. A click turns it on and round to OFF after TEAM;
 * the arrow keys stop at either end.
 */
export function turnSelector(position: IntercomPosition, step: 'click' | 1 | -1): IntercomPosition {
    const i = intercomPositions.indexOf(position);
    if (step === 'click') return intercomPositions[(i + 1) % intercomPositions.length];
    return intercomPositions[Math.max(0, Math.min(intercomPositions.length - 1, i + step))];
}

/** The TALK lamp: the voice goes out now. */
export function transmitting(deck: IntercomDeck) {
    return deck.line === 'on' && deck.open && deck.route !== null;
}

/** The selector's label, for the control over it. */
export function selectorLabel(deck: IntercomDeck): [string, string[]] {
    if (!deck.available) return ['对讲旋钮 · 服务器没有开启语音', []];
    return ['对讲旋钮：{0}', [['关', '全桌', '本队'][intercomPositions.indexOf(deck.selector)]]];
}

/** The TALK key's label, for the control over it. */
export function talkLabel(deck: IntercomDeck): string {
    if (!deck.available || deck.line === 'off') return '对讲 TALK 键 · 先把旋钮转到 ALL 或 TEAM';
    if (deck.listenOnly) return '没有可用的麦克风，只能收听';
    if (deck.mode === 'hold') return '对讲 TALK 键：按住说话';
    return deck.open ? '对讲 TALK 键：已开麦，按下闭麦' : '对讲 TALK 键：按下开麦';
}

/** The intercom in words, for the transcript. */
export function intercomLine(deck: IntercomDeck): [string, string[]] {
    if (deck.line === 'off') return ['对讲：关', []];
    if (deck.line === 'connecting') return ['对讲：正在接通', []];
    return ['对讲：{0} · {1}', [deck.route === 'table' ? '全桌' : deck.route === 'team' ? '本队' : '静音', transmitting(deck) ? '正在发言' : '未发言']];
}

/**
 * DEV `?intercom=`: an intercom without a server, from comma-separated words:
 * `all` or `team` (on the line), `connecting`, `talk` (key down), `hold`,
 * `huddle` (talking to the team whatever the selector says), `quiet` (silent
 * while teams are apart). `rx` is read by the page: the RX lamp breathes.
 */
export function previewIntercom(spec: string): IntercomDeck {
    const words = new Set(spec.split(','));
    const selector: IntercomPosition = words.has('team') ? 'team' : words.has('all') || words.has('huddle') || words.has('quiet') || words.has('connecting') ? 'all' : 'off';
    const line = selector === 'off' ? 'off' : words.has('connecting') ? 'connecting' : 'on';
    const route: VoiceChannel | null = line !== 'on' || words.has('quiet') ? null : selector === 'team' || words.has('huddle') ? 'team' : 'table';
    return { available: true, line, selector, route, open: words.has('talk'), mode: words.has('hold') ? 'hold' : 'toggle', listenOnly: false };
}
