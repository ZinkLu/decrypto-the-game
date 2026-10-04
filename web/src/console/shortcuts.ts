/** Text entry, including a child inside a rich-text editor, owns its keystrokes. */
export function isEditingTarget(target: EventTarget | null) {
    return typeof Element !== 'undefined' && target instanceof Element &&
        (!!target.closest('input, textarea, select, [role="textbox"]') ||
            target instanceof HTMLElement && target.isContentEditable);
}

/** Enter on a focused control keeps the browser's normal activation behaviour. */
export function isNativeKeyTarget(target: EventTarget | null) {
    return typeof Element !== 'undefined' && target instanceof Element &&
        !!target.closest('button, a[href], summary, input, textarea, select, [role="button"], [role="slider"]');
}

type KeyStroke = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'keyCode' | 'defaultPrevented'>;

export interface ShortcutContext {
    editing: boolean;
    nativeControl: boolean;
    /** Only the terminal's name, channel and clue fields may submit while editing. */
    submitInput: boolean;
    manual: boolean;
    briefing: boolean;
}

/** Intent only: the console still applies its power, face, phase and ready gates. */
export function shortcutAction(event: KeyStroke, context: ShortcutContext): string | null {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return null;
    const { key, ctrlKey, metaKey, altKey, shiftKey } = event;
    if (ctrlKey || metaKey || altKey) {
        return (ctrlKey || metaKey) && !altKey && !shiftKey && key === 'Enter' && !context.manual &&
            (!context.editing || context.submitInput) ? 'transmit' : null;
    }
    if (key === 'Escape') return 'dismiss';
    if (context.editing) return null;
    if (key === '?') return 'shortcuts';
    if (key.toLowerCase() === 'h') return 'archive-toggle';
    if (key.toLowerCase() === 'g') return 'manual';
    if (context.manual) {
        if (key === 'ArrowLeft' || key === 'Backspace') return 'guide-prev';
        if (key === 'ArrowRight') return 'guide-next';
        return /^[1-4]$/.test(key) ? `guide-page-${Number(key) - 1}` : null;
    }
    if (context.briefing && !context.nativeControl &&
        ['Enter', ' ', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return 'brief-skip';
    if (/^[1-4]$/.test(key)) return `key-${Number(key) - 1}`;
    if (key === 'Backspace') return 'key-4';
    if (key === 'Enter' && !shiftKey && !context.nativeControl) return 'transmit';
    return null;
}

/** Shared by projected controls, their accessible labels and hover hints. */
export function controlShortcut(id: string) {
    if (/^key-[0-3]$/.test(id)) return String(Number(id.slice(4)) + 1);
    return ({ 'key-4': 'Backspace', transmit: 'Control+Enter Meta+Enter', 'archive-toggle': 'H', manual: 'G', 'voice-talk': '`', 'voice-line': 'V' } as Record<string, string>)[id];
}

export function shortcutLabel(id: string) {
    return id === 'transmit' ? 'Ctrl / ⌘ + Enter' : controlShortcut(id);
}
