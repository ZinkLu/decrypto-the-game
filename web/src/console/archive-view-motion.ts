export type ArchiveView = 'both' | 'notebook' | 'receipt';
type Item = Exclude<ArchiveView, 'both'>;
type SavedStyle = Map<string, { value: string; priority: string }>;
type Surface = { element: HTMLElement; fades: HTMLElement[] };
type Pose = { bounds: DOMRect; opacity: number; visible: boolean };

const isVisible = (view: ArchiveView, item: Item) => view === 'both' || view === item;

/** FLIP uses individual translate/scale, leaving the paper's entrance transform alone. */
export class ArchiveViewMotion {
    view: ArchiveView;
    private track: HTMLElement;
    private surfaces: Record<Item, Surface>;
    private animations: Animation[] = [];
    private styles = new Map<HTMLElement, SavedStyle>();
    private inert = new Map<HTMLElement, boolean>();
    private epoch = 0;
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    private rate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
    private observer: MutationObserver;

    constructor(private dialog: HTMLDialogElement) {
        this.track = dialog.querySelector<HTMLElement>('.archive-paper-track')!;
        const notebook = dialog.querySelector<HTMLElement>('.field-notebook')!;
        const receipt = dialog.querySelector<HTMLElement>('.archive-receipt-track')!;
        this.surfaces = {
            notebook: { element: notebook, fades: Array.from(notebook.querySelectorAll<HTMLElement>(':scope > .notebook-toolbar, :scope > .notebook-cover')) },
            receipt: { element: receipt, fades: [receipt] },
        };
        this.view = dialog.dataset.view === 'notebook' || dialog.dataset.view === 'receipt' ? dialog.dataset.view : 'both';
        dialog.dataset.view = this.view;
        this.observer = new MutationObserver(() => {
            if (!dialog.open || dialog.dataset.open !== 'false') {
                delete dialog.dataset.viewInteracted;
                this.finish();
            }
            else this.freezeForExit();
        });
        this.observer.observe(dialog, { attributes: true, attributeFilter: ['data-open', 'open'] });
        window.addEventListener('resize', this.finish);
        this.reduced.addEventListener('change', this.finish);
    }

    toggle(item: Item) {
        if (this.dialog.dataset.open === 'false') return this.view;
        const other = item === 'notebook' ? 'receipt' : 'notebook';
        this.show(isVisible(this.view, item) ? other : 'both');
        return this.view;
    }

    private remember(element: HTMLElement, property: string) {
        let saved = this.styles.get(element);
        if (!saved) { saved = new Map(); this.styles.set(element, saved); }
        if (!saved.has(property)) saved.set(property, { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) });
    }

    private style(element: HTMLElement, property: string, value: string) {
        this.remember(element, property);
        element.style.setProperty(property, value);
    }

    private animate(element: HTMLElement, frames: Keyframe[], duration = 220) {
        frames.forEach(frame => Object.keys(frame).forEach(property => this.remember(element, property)));
        this.animations.push(element.animate(frames, {
            duration: duration / this.rate, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
        }));
    }

    private show(next: ArchiveView) {
        const poses = new Map<Item, Pose>();
        for (const item of ['notebook', 'receipt'] as const) {
            const { element, fades } = this.surfaces[item];
            const entrance = item === 'notebook' ? element : element.querySelector<HTMLElement>('.archive-sheet')!;
            poses.set(item, {
                bounds: entrance.getBoundingClientRect(),
                opacity: Number(getComputedStyle(fades[0]).opacity) * Number(getComputedStyle(entrance).opacity),
                visible: getComputedStyle(element).display !== 'none',
            });
        }
        this.finish();
        this.view = next;
        this.dialog.dataset.viewInteracted = 'true';
        this.dialog.dataset.view = next;
        this.dialog.scrollTop = 0;
        if (this.reduced.matches || !this.dialog.open) return;
        const epoch = this.epoch;
        const track = this.track.getBoundingClientRect();

        for (const item of ['notebook', 'receipt'] as const) {
            const { element, fades } = this.surfaces[item];
            const pose = poses.get(item)!;
            const visible = isVisible(next, item);
            if (!visible && !pose.visible) continue;

            if (!visible) {
                // Keep the outgoing real paper over its old viewport position while the grid reflows.
                // Track-relative coordinates also preserve its pose after resetting a long roll's scroll.
                this.style(element, 'position', 'absolute');
                this.style(element, 'left', `${pose.bounds.left - track.left}px`);
                this.style(element, 'top', `${pose.bounds.top - track.top}px`);
                this.style(element, 'width', `${pose.bounds.width}px`);
                this.style(element, 'display', 'block');
                this.style(element, 'pointer-events', 'none');
                this.inert.set(element, element.inert);
                element.inert = true;
                for (const fade of fades) this.animate(fade, [{ opacity: pose.opacity }, { opacity: 0 }], 180);
                continue;
            }

            const destination = element.getBoundingClientRect();
            if (pose.visible && pose.bounds.width && destination.width) {
                const x = pose.bounds.left + pose.bounds.width / 2 - destination.left - destination.width / 2;
                const y = pose.bounds.top + pose.bounds.height / 2 - destination.top - destination.height / 2;
                const sx = pose.bounds.width / destination.width;
                const sy = destination.height ? pose.bounds.height / destination.height : 1;
                this.animate(element, [
                    { translate: `${x}px ${y}px`, scale: `${sx} ${sy}` },
                    { translate: '0px 0px', scale: '1 1' },
                ]);
            }
            for (const fade of fades) this.animate(fade, [{ opacity: pose.visible ? pose.opacity : 0 }, { opacity: 1 }]);
        }

        Promise.all(this.animations.map(animation => animation.finished)).then(() => {
            if (epoch === this.epoch) this.finish();
        }).catch(() => { /* A newer view or archive close owns the next pose. */ });
    }

    /** The outer paper exit can continue from this exact view pose, including its current opacity. */
    private freezeForExit() {
        if (!this.animations.length) return;
        const frozen = Array.from(this.styles, ([element, properties]) => {
            const computed = getComputedStyle(element);
            return { element, properties: Array.from(properties.keys()).filter(property => ['opacity', 'translate', 'scale'].includes(property))
                .map(property => [property, computed.getPropertyValue(property)] as const) };
        });
        this.epoch++;
        this.animations.forEach(animation => animation.cancel());
        this.animations = [];
        frozen.forEach(({ element, properties }) => properties.forEach(([property, value]) => element.style.setProperty(property, value)));
    }

    private finish = () => {
        this.epoch++;
        this.animations.forEach(animation => animation.cancel());
        this.animations = [];
        this.styles.forEach((properties, element) => properties.forEach(({ value, priority }, property) => {
            if (value) element.style.setProperty(property, value, priority);
            else element.style.removeProperty(property);
        }));
        this.styles.clear();
        this.inert.forEach((value, element) => { element.inert = value; });
        this.inert.clear();
    };

    dispose() {
        this.finish();
        delete this.dialog.dataset.viewInteracted;
        this.observer.disconnect();
        window.removeEventListener('resize', this.finish);
        this.reduced.removeEventListener('change', this.finish);
    }
}
