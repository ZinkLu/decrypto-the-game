import { useEffect, useRef, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { pullKeyDisk, releaseKeyDisk, type KeyDiskState } from './model';

export interface DiskPullAxis { x: number; y: number; pixels: number }
interface Options {
    disk: KeyDiskState;
    enabled: boolean;
    reduced: boolean;
    axis: () => DiskPullAxis;
    onChange: (disk: KeyDiskState) => void;
    onClick: () => void;
}
/** One captured pointer owns the gesture; late clicks and cancelled pointers cannot reinsert the disk. */
export function useDiskPull(options: Options) {
    const latest = useRef(options);
    latest.current = options;
    const gesture = useRef<{ pointer: number; node: HTMLElement; x: number; y: number; axis: DiskPullAxis;
        start: number; disk: KeyDiskState; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    function finish(cancelled: boolean) {
        const drag = gesture.current;
        if (!drag) return;
        gesture.current = null;
        drag.node.removeAttribute('data-pulling');
        if (drag.node.hasPointerCapture(drag.pointer)) drag.node.releasePointerCapture(drag.pointer);
        // Keep suppression until the next press, including Escape followed by
        // a long hold before mouse-up. Keyboard activation still works.
        suppressClick.current = drag.moved || cancelled;
        if (drag.moved) {
            if (drag.disk.id === latest.current.disk.id)
                latest.current.onChange(releaseKeyDisk(drag.disk, cancelled, performance.now(), latest.current.reduced));
        }
    }
    useEffect(() => {
        if (!options.enabled || gesture.current && gesture.current.disk.id !== options.disk.id) finish(true);
    }, [options.enabled, options.disk.id]);
    useEffect(() => {
        const cancel = () => finish(true);
        const hide = () => { if (document.hidden) cancel(); };
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', hide);
        return () => {
            window.removeEventListener('blur', cancel);
            document.removeEventListener('visibilitychange', hide);
            const drag = gesture.current;
            gesture.current = null;
            if (drag?.node.hasPointerCapture(drag.pointer)) drag.node.releasePointerCapture(drag.pointer);
        };
    }, []);
    return {
        onPointerDown(event: PointerEvent<HTMLElement>) {
            const { disk, enabled, axis } = latest.current;
            if (!enabled || gesture.current || !event.isPrimary || event.button !== 0 || !['ready', 'reading', 'ejected', 'removed'].includes(disk.phase)) return;
            event.stopPropagation();
            suppressClick.current = false;
            gesture.current = { pointer: event.pointerId, node: event.currentTarget, x: event.clientX, y: event.clientY,
                start: disk.phase === 'removed' ? 2 : disk.phase === 'ejected' ? 1 : 0, axis: axis(), disk, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const drag = gesture.current;
            if (!drag || drag.pointer !== event.pointerId || !latest.current.enabled || drag.disk.id !== latest.current.disk.id) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 6) return;
            drag.moved = true;
            drag.node.setAttribute('data-pulling', 'true');
            const amount = drag.start + (dx * drag.axis.x + dy * drag.axis.y) / drag.axis.pixels;
            drag.disk = pullKeyDisk(drag.disk, amount, performance.now());
            latest.current.onChange(drag.disk);
        },
        onPointerUp(event: PointerEvent<HTMLElement>) { if (gesture.current?.pointer === event.pointerId) finish(false); },
        onPointerCancel(event: PointerEvent<HTMLElement>) { if (gesture.current?.pointer === event.pointerId) finish(true); },
        onLostPointerCapture(event: PointerEvent<HTMLElement>) { if (gesture.current?.pointer === event.pointerId) finish(true); },
        onKeyDown(event: KeyboardEvent<HTMLElement>) {
            if (event.key === 'Escape' && gesture.current) { event.preventDefault(); finish(true); }
        },
        onClick(event: MouseEvent<HTMLElement>) {
            if (event.detail > 0 && suppressClick.current) { event.preventDefault(); return; }
            latest.current.onClick();
        },
    };
}
