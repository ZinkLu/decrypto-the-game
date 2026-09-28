/** Bistable flag: a pulse turns a physical blade; removing power keeps its score. */
export class ScoreFlagMotion {
    angle = 0;
    private initialized = false;
    private target = 0;
    private impact = false;
    private motion?: { from: number; elapsed: number; delay: number; duration: number; struck: boolean };

    sync(active: boolean, powered = true, stagger = 0) {
        const target = active ? Math.PI : 0;
        if (!this.initialized) {
            this.angle = this.target = target;
            this.initialized = true;
        } else if (powered && target !== this.target) {
            this.target = target;
            this.impact = false;
            const travel = Math.abs(target - this.angle);
            // A command cancelled before release never moves or hits a stop.
            if (travel < .00001) { this.motion = undefined; this.angle = target; return false; }
            const underway = this.motion && this.motion.elapsed > this.motion.delay;
            this.motion = { from: this.angle, elapsed: 0,
                delay: underway ? 0 : .022 + Math.max(0, stagger),
                duration: .17 * Math.max(.3, travel / Math.PI), struck: false };
            return true;
        }
        return false;
    }

    /** One dry click at first contact, never on restore, recoil or reduced motion. */
    consumeImpact() {
        const impact = this.impact;
        this.impact = false;
        return impact;
    }

    advance(dt: number, reduced = false) {
        const before = this.angle;
        if (reduced) {
            this.angle = this.target;
            this.motion = undefined;
            this.impact = false;
        } else if (this.motion) {
            const m = this.motion;
            m.elapsed += Math.max(0, dt);
            const travelTime = m.elapsed - m.delay;
            if (travelTime < 0) return false;
            const t = Math.min(1, travelTime / m.duration);
            // The spring accelerates the blade into its stop with nonzero speed.
            this.angle = m.from + (this.target - m.from) * t * t * (2 - t);
            if (t === 1) {
                if (!m.struck) { this.impact = true; m.struck = true; }
                const settle = Math.min(1, (travelTime - m.duration) / .064);
                const recoil = Math.min(Math.PI / 150, Math.abs(this.target - m.from) * .12);
                // Recoil is toward the old face, within the physical end stops.
                this.angle = this.target - Math.sign(this.target - m.from) * recoil * Math.sin(Math.PI * settle) ** 2;
                if (settle === 1) { this.angle = this.target; this.motion = undefined; }
            }
        }
        return this.angle !== before;
    }
}
