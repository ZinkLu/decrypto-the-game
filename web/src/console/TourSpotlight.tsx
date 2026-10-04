import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { spotlightBounds, spotlightMask, type SpotlightRect } from './spotlight';

interface Props {
    selector: string;
    card: RefObject<HTMLElement | null>;
    measure?: () => SpotlightRect[];
}
interface Spotlight { focus: SpotlightRect; mask: string }

/** A cutout over the actual model, not a copy of its WebGL pixels or controls. */
export default function TourSpotlight({ selector, card, measure }: Props) {
    const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
    const region = useRef(measure);
    region.current = measure;
    useLayoutEffect(() => {
        let frame = 0;
        let previous = '';
        let targets: HTMLElement[] = [];
        const panels = Array.from(document.querySelectorAll<HTMLDetailsElement>('#station-preferences, #station-shortcuts'));
        const clear = () => { previous = ''; setSpotlight(null); };
        const update = () => {
            frame = 0;
            if (!card.current || document.hidden || panels.some(panel => panel.open)) { clear(); return; }
            const current = Array.from(document.querySelectorAll<HTMLElement>(selector));
            if (current.length !== targets.length || current.some((target, index) => target !== targets[index])) {
                targets.forEach(target => resize.unobserve(target));
                targets = current;
                for (const target of targets) {
                    resize.observe(target);
                    mutation.observe(target, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
                }
            }
            const visible = targets.filter(target => target.getClientRects().length && getComputedStyle(target).visibility !== 'hidden');
            const focus = spotlightBounds(region.current?.() ?? visible.map(target => target.getBoundingClientRect()), innerWidth, innerHeight, region.current ? 24 : 14);
            const note = spotlightBounds([card.current.getBoundingClientRect()], innerWidth, innerHeight, 0);
            // A disappearing or offscreen target must never leave the whole page blurred.
            if (!focus || !note) { clear(); return; }
            const key = JSON.stringify([innerWidth, innerHeight, focus, note]);
            if (key === previous) return;
            previous = key;
            setSpotlight({ focus, mask: spotlightMask(innerWidth, innerHeight, [focus, note]) });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const resize = new ResizeObserver(schedule);
        const mutation = new MutationObserver(schedule);
        const station = card.current?.closest('.station');
        if (station) mutation.observe(station, { childList: true, subtree: true });
        if (card.current) resize.observe(card.current);
        const rail = card.current?.closest('.station-notices');
        if (rail) {
            resize.observe(rail);
            mutation.observe(rail, { attributes: true, attributeFilter: ['style', 'hidden'] });
        }
        for (const panel of panels) panel.addEventListener('toggle', schedule);
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true);
        document.addEventListener('visibilitychange', schedule);
        window.visualViewport?.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('scroll', schedule);
        // OperationTour may first scroll the compact control into view.
        schedule();
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect(); mutation.disconnect();
            for (const panel of panels) panel.removeEventListener('toggle', schedule);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule, true);
            document.removeEventListener('visibilitychange', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
        };
    }, [selector, card]);
    if (!spotlight) return null;
    return createPortal(<div className="tour-spotlight" aria-hidden="true">
        <div className="tour-spotlight-shade" style={{ maskImage: spotlight.mask, WebkitMaskImage: spotlight.mask }}/>
        <div className="tour-spotlight-frame" style={spotlight.focus}/>
    </div>, document.body);
}
