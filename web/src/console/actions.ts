import { handleSurfaces } from './view';

/** What stands between a control and what it does. */
export interface Reach {
    powered: boolean;
    /** Powered, linked and connected: the server can be reached. */
    online: boolean;
    /** The machine shows its service side. */
    rear: boolean;
    batteryOpen: boolean;
    /** A request is on its way to the server. */
    pending: boolean;
    /** The main screen shows a briefing, which ACTION only puts away. */
    briefing: boolean;
}

const has = (id: string, ...names: string[]) => names.some(name => name.endsWith('-') ? id.startsWith(name) : id === name);

// Turning the machine, its mains and its speaker never depend on its state.
const free = (id: string) => id in handleSurfaces ||
    has(id, 'restore-power', 'restore-link', 'power-toggle', 'restore-switch', 'sound-toggle', 'music-toggle');
// What the terminal does by itself: pages, dials, the drive, the printer, the keypad.
const local = (id: string) => has(id, 'receiver-sweep', 'meter-', 'brief-skip', 'manual', 'about', 'screen-close', 'guide-done',
    'guide-prev', 'guide-next', 'guide-page-', 'words', 'mode-', 'archive-toggle', 'disk-toggle', 'disk-eject', 'scope-', 'slot-', 'key-');

/**
 * Whether a control does anything in this state of the machine. What it does then,
 * and whether this seat may do it in this round, is the control's own business.
 */
export function reachable(id: string, machine: Reach) {
    // The mains switch is on the front.
    if (free(id)) return !(id === 'power-toggle' && machine.rear);
    // A dead machine still gives up its disk.
    if (!machine.powered && !machine.rear && !has(id, 'disk-toggle', 'disk-eject')) return false;
    if (id === 'battery-toggle') return true;
    if (has(id, 'battery-cell-')) return machine.rear && machine.batteryOpen;
    if (has(id, 'cable-plug-')) return machine.rear;
    if (id === 'lamp-test') return machine.powered;
    // Nothing on the front can be reached from behind.
    if (machine.rear) return false;
    if (local(id) || id === 'transmit' && machine.briefing) return true;
    // Leaving and copying the room code need the link, but never wait for a reply.
    if (has(id, 'leave-room', 'copy-code')) return machine.online;
    return machine.online && !machine.pending;
}
