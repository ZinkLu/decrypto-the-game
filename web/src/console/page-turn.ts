type Hinge = { position: number; velocity: number };
type Target = 0 | 1;

/** A paper hinge under a critically damped torsion spring, with hard stops at both pages. */
export function stepNotebookHinge(hinge: Hinge, target: Target, elapsed: number): Hinge {
    const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(.05, elapsed)) : 0;
    if (!dt) return hinge;
    const frequency = 12;
    const displacement = hinge.position - target;
    const impulse = hinge.velocity + frequency * displacement;
    const decay = Math.exp(-frequency * dt);
    const position = target + (displacement + impulse * dt) * decay;
    const velocity = (hinge.velocity - frequency * impulse * dt) * decay;
    if (position <= 0 || position >= 1) return { position: Math.max(0, Math.min(1, position)), velocity: 0 };
    if (Math.abs(position - target) < .001 && Math.abs(velocity) < .02) return { position: target, velocity: 0 };
    return { position, velocity };
}

/** Fixed-length strips let the free edge lead without stretching print or ink. */
export function notebookPaperBend(position: number, height: number, count = 12) {
    const amount = Math.max(0, Math.min(1, position));
    const length = height / count;
    const held = Math.pow(amount, 1.5);
    const free = Math.pow(amount, .72);
    let y = 0, z = 0;
    return Array.from({ length: count }, (_, index) => {
        const along = (index + .5) / count;
        const angle = Math.PI * (held + (free - held) * Math.pow(along, 1.2));
        const segment = { y, z, angle, length };
        y += Math.cos(angle) * length;
        z += Math.sin(angle) * length;
        return segment;
    });
}

type Strip = { element: HTMLElement; back: HTMLElement; light: HTMLElement };
type Turn = {
    hinge: Hinge;
    target: Target;
    frame: number;
    previous: number;
    stage: HTMLElement;
    strips: Strip[];
    height: number;
    base: HTMLElement;
    shade: HTMLElement;
    pages: { element: HTMLElement; inert: boolean }[];
};
type Notebook = { turn?: Turn; reduced: MediaQueryList; rate: number };
const notebooks = new WeakMap<HTMLElement, Notebook>();

function settle(root: HTMLElement) {
    const notebook = notebooks.get(root);
    const turn = notebook?.turn;
    if (!turn) return;
    cancelAnimationFrame(turn.frame);
    turn.stage.remove();
    turn.pages.forEach(page => { page.element.inert = page.inert; });
    delete root.dataset.pageTurn;
    root.removeAttribute('aria-busy');
    notebook!.turn = undefined;
}

/** Stable React ref: no hook or state changes, including during fast refresh. */
export function attachNotebookTurn(root: HTMLElement | null) {
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const rate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
    notebooks.set(root, { reduced, rate });
    const finish = () => settle(root);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    const resize = () => finish();
    const dialog = root.closest('dialog');
    const observer = new MutationObserver(changes => {
        if (changes.some(change => change.attributeName === 'data-view') || dialog?.dataset.open === 'false' || !dialog?.open) finish();
    });
    if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['data-open', 'data-view', 'open'] });
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', resize);
    reduced.addEventListener('change', finish);
    return () => {
        finish();
        observer.disconnect();
        document.removeEventListener('keydown', escape, true);
        window.removeEventListener('resize', resize);
        reduced.removeEventListener('change', finish);
        notebooks.delete(root);
    };
}

function copyPage(source: HTMLElement) {
    const copy = source.cloneNode(true) as HTMLElement;
    copy.hidden = false;
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('aria-label');
    copy.removeAttribute('data-team');
    copy.querySelectorAll<HTMLElement>('[data-selected]').forEach(element => { element.dataset.selected = 'false'; });
    const originals = [source, ...source.querySelectorAll<HTMLElement | SVGElement>('*')];
    const duplicates = [copy, ...copy.querySelectorAll<HTMLElement | SVGElement>('*')];
    originals.forEach((original, index) => {
        const duplicate = duplicates[index];
        duplicate.removeAttribute('id');
        duplicate.removeAttribute('tabindex');
        if (original instanceof HTMLTextAreaElement && duplicate instanceof HTMLTextAreaElement) {
            duplicate.value = original.value;
            duplicate.textContent = original.value;
            duplicate.readOnly = true;
            duplicate.tabIndex = -1;
        }
        if (original instanceof HTMLInputElement && duplicate instanceof HTMLInputElement) {
            duplicate.value = original.value;
            duplicate.readOnly = true;
            duplicate.tabIndex = -1;
        }
    });
    return { copy, restoreScroll: () => originals.forEach((original, index) => {
        duplicates[index].scrollTop = original.scrollTop;
        duplicates[index].scrollLeft = original.scrollLeft;
    }) };
}

function draw(turn: Turn) {
    const amount = turn.hinge.position;
    const lift = Math.max(0, Math.min(1, (amount - .64) / .36));
    const backOpacity = 1 - lift * lift * (3 - 2 * lift);
    const segments = notebookPaperBend(amount, turn.height, turn.strips.length);
    turn.strips.forEach((strip, index) => {
        const { y, z, angle } = segments[index];
        strip.element.style.transform = `translate3d(0,${y}px,${z}px) rotateX(${angle}rad)`;
        strip.back.style.opacity = String(backOpacity);
        strip.light.style.opacity = String(Math.sin(angle) * .14);
    });
    turn.base.style.opacity = String(1 - Math.sin(Math.PI * amount) * .04);
    turn.shade.style.opacity = String(Math.sin(Math.PI * amount) * .24);
    turn.shade.style.transform = `scaleY(${Math.max(.05, Math.cos(Math.PI * amount / 2))})`;
}

/** The first sheet hinges upward around the top clip; the second rests underneath. New clicks reverse that same sheet. */
export function turnNotebookPage(root: HTMLElement, firstTeam: string, currentTeam: string, nextTeam: string) {
    const notebook = notebooks.get(root);
    if (!notebook || notebook.reduced.matches) { settle(root); return; }
    const target: Target = nextTeam === firstTeam ? 0 : 1;
    if (notebook.turn) { notebook.turn.target = target; return; }
    if (currentTeam === nextTeam) return;
    const spread = root.querySelector<HTMLElement>('.notebook-spread');
    const pages = Array.from(spread?.querySelectorAll<HTMLElement>(':scope > .notebook-page[data-team]') ?? []);
    const first = pages.find(page => page.dataset.team === firstTeam);
    const second = pages.find(page => page !== first);
    if (!spread || !first || !second) return;

    const height = spread.clientHeight;
    if (!height) return;
    const base = copyPage(second);
    const stage = document.createElement('div');
    stage.className = 'notebook-turn-stage';
    stage.inert = true;
    stage.setAttribute('aria-hidden', 'true');
    stage.style.setProperty('--turn-height', `${height}px`);
    base.copy.classList.add('notebook-turn-base');
    const shade = document.createElement('div');
    shade.className = 'notebook-turn-shadow';
    stage.append(base.copy, shade);
    const restores: (() => void)[] = [base.restoreScroll];
    const strips = notebookPaperBend(0, height).map(({ length }, index) => {
        const element = document.createElement('div');
        element.className = 'notebook-turn-strip';
        element.style.height = `${length + .6}px`;
        const front = document.createElement('div');
        front.className = 'notebook-turn-face notebook-turn-front';
        const snapshot = copyPage(first);
        snapshot.copy.style.top = `${-index * length}px`;
        front.append(snapshot.copy);
        restores.push(snapshot.restoreScroll);
        const back = document.createElement('div');
        back.className = 'notebook-turn-face notebook-turn-back';
        back.style.backgroundPosition = `0 ${-index * length}px`;
        const light = document.createElement('div');
        light.className = 'notebook-turn-light';
        front.append(light);
        element.append(front, back);
        stage.append(element);
        return { element, back, light };
    });
    spread.append(stage);
    restores.forEach(restore => restore());
    const turn: Turn = {
        hinge: { position: currentTeam === firstTeam ? 0 : 1, velocity: 0 },
        target, frame: 0, previous: performance.now(), stage, strips, height, base: base.copy, shade,
        pages: pages.map(element => ({ element, inert: element.inert })),
    };
    turn.pages.forEach(page => { page.element.inert = true; });
    notebook.turn = turn;
    root.dataset.pageTurn = 'true';
    root.setAttribute('aria-busy', 'true');
    draw(turn);
    const frame = (now: number) => {
        if (!root.isConnected) { settle(root); return; }
        turn.hinge = stepNotebookHinge(turn.hinge, turn.target, Math.min(.05, (now - turn.previous) / 1000) * notebook.rate);
        turn.previous = now;
        draw(turn);
        if (turn.hinge.position === turn.target && turn.hinge.velocity === 0) settle(root);
        else turn.frame = requestAnimationFrame(frame);
    };
    turn.frame = requestAnimationFrame(frame);
}
