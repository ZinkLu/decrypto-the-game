/** Keep the outgoing name on its card until the complete card clears the rack. */
export class RosterMotion<T extends { id: string }> {
    current: T | null = null;
    private desired: T | null = null;
    amount = 1;
    private initialized = false;
    private motion?: { from: number; to: number; elapsed: number; duration: number };

    sync(next: T | null) {
        this.desired = next;
        if (!this.initialized) {
            this.current = next;
            this.amount = next ? 0 : 1;
            this.initialized = true;
        } else if (next && this.current?.id === next.id) {
            // Progress and nickname edits update ink without exchanging the card.
            this.current = next;
        }
    }

    advance(dt: number, reduced = false) {
        if (reduced) {
            this.current = this.desired;
            this.amount = this.current ? 0 : 1;
            this.motion = undefined;
            return;
        }
        if (!this.current) this.current = this.desired;
        const to = this.current && this.current.id === this.desired?.id ? 0 : 1;
        if (this.amount !== to) {
            if (this.motion?.to !== to) {
                this.motion = { from: this.amount, to, elapsed: 0,
                    duration: (to ? .42 : .54) * Math.max(.3, Math.abs(to - this.amount)) };
            }
            const motion = this.motion;
            motion.elapsed += Math.max(0, dt);
            const t = Math.min(1, motion.elapsed / motion.duration);
            // Each physical stage eases in rosterPose; keep the timeline even
            // so alignment and seating get time instead of snapping at the end.
            this.amount = motion.from + (to - motion.from) * t;
            if (t === 1) { this.amount = to; this.motion = undefined; }
        }
        if (this.amount === 1 && this.current?.id !== this.desired?.id) {
            // Only exchange the printed face while fully out of sight. Rapid
            // replacements collapse to the latest person, with no stale queue.
            this.current = this.desired;
        }
    }
}

export function rosterPose(amount: number, travel = .58) {
    const a = Math.max(0, Math.min(1, amount));
    const smooth = (value: number) => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
    };
    // The low fixed lip remains in front throughout seating. Lift within the
    // gap above the card FIRST, clear the rack in depth SECOND, then take it
    // away. The reverse path drops behind the lip, never through its face.
    const release = smooth(a / .28);
    const clear = smooth((a - .28) / .28);
    const take = smooth((a - .56) / .44);
    return { y: release * .045 + take * (travel - .045), z: clear * .16,
        opacity: a === 1 ? 0 : 1 - smooth((a - .88) / .12) };
}
