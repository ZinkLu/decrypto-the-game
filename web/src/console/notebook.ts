export interface Notes { general: string; rounds: Record<string, string> }
export const emptyNotes = (): Notes => ({ general: '', rounds: {} });
export function notesKey(room: string | null, player: string, preview: boolean) {
    return `decrypto:notes:v1:${preview ? 'preview' : 'live'}:${room || 'unassigned'}:${player || 'guest'}`;
}
export function parseNotes(raw: string | null): Notes {
    if (!raw) return emptyNotes();
    try {
        const value = JSON.parse(raw);
        const rounds: Record<string, string> = {};
        if (value?.rounds && typeof value.rounds === 'object') {
            for (const [key, note] of Object.entries(value.rounds)) {
                if (/^\d+$/.test(key) && typeof note === 'string') rounds[key] = note.slice(0, 2000);
            }
        }
        return { general: typeof value?.general === 'string' ? value.general.slice(0, 10000) : '', rounds };
    } catch { return emptyNotes(); }
}
