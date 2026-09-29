import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { translate } from './i18n';
import { containNote, moveNote, placeNote, type PaperPoint } from './notebook-writing';
import './notebook-writing.css';

type Note = PaperPoint & { id: number; text: string; width: number };
type Drag = { id: number; pointer: number; start: PaperPoint; origin: PaperPoint; handle: HTMLButtonElement };
type Props = { team: 'A' | 'B'; locale: 'zh' | 'en'; enabled: boolean; initialNotes?: string[] };

export default function NotebookWriting({ team, locale, enabled, initialNotes = [] }: Props) {
    const t = (message: string) => translate(locale, message);
    const [notes, setNotes] = useState<Note[]>(() => initialNotes.flatMap((text, index) => text.trim()
        ? [{ id: index, text, x: 28, y: Math.min(82, 27 + index * 16), width: 48 }] : []));
    const [selected, setSelected] = useState<number | null>(null);
    const layer = useRef<HTMLDivElement>(null);
    const coordinates = useRef<SVGSVGElement>(null);
    const serial = useRef(initialNotes.length);
    const focusNext = useRef<number | null>(null);
    const drag = useRef<Drag | null>(null);

    function paperPoint(clientX: number, clientY: number): PaperPoint | null {
        const matrix = coordinates.current?.getScreenCTM();
        if (!matrix) return null;
        try {
            const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
            return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
        } catch { return null; }
    }

    function noteSize(id?: number): PaperPoint {
        const root = layer.current;
        const note = id === undefined ? null : root?.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
        return {
            x: note && root?.clientWidth ? note.offsetWidth / root.clientWidth * 100 : notes.find(item => item.id === id)?.width ?? 48,
            y: note && root?.clientHeight ? note.offsetHeight / root.clientHeight * 100 : 6,
        };
    }

    function finishDrag(cancelled: boolean) {
        const active = drag.current;
        if (!active) return;
        drag.current = null;
        if (cancelled) setNotes(previous => previous.map(note => note.id === active.id ? { ...note, ...active.origin } : note));
        if (active.handle.hasPointerCapture(active.pointer)) active.handle.releasePointerCapture(active.pointer);
    }

    function startDrag(event: PointerEvent<HTMLButtonElement>, note: Note) {
        if (!enabled || !event.isPrimary || event.button !== 0 || drag.current) return;
        const point = paperPoint(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelected(note.id);
        drag.current = { id: note.id, pointer: event.pointerId, start: point, origin: { x: note.x, y: note.y }, handle: event.currentTarget };
    }

    useEffect(() => {
        const page = layer.current?.closest<HTMLElement>('.notebook-page');
        if (!page || !enabled) return;
        let down: { x: number; y: number } | null = null;
        const unavailable = () => page.hidden || !!page.closest('[inert], [data-page-turn="true"], [data-open="false"]');
        const add = (position: PaperPoint) => {
            const id = serial.current++;
            focusNext.current = id;
            setSelected(id);
            setNotes(previous => [...previous, { id, text: '', ...placeNote(position, layer.current?.clientWidth ?? 450) }]);
        };
        const pointerDown = (event: globalThis.PointerEvent) => {
            down = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
        };
        const cancel = () => { down = null; };
        const click = (event: MouseEvent) => {
            const start = down;
            down = null;
            const target = event.target;
            if (unavailable() || !(target instanceof Element) || !start || event.button !== 0) return;
            if (target.closest('button, input, textarea, select, a, [contenteditable="true"], [role="button"], .notebook-freewriting, .notebook-clue')) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 || !window.getSelection()?.isCollapsed) return;
            const point = paperPoint(event.clientX, event.clientY);
            if (point) add(point);
        };
        const key = (event: KeyboardEvent) => {
            if (unavailable() || event.target !== page || event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            add({ x: 26, y: 76 });
        };
        page.addEventListener('pointerdown', pointerDown);
        page.addEventListener('pointercancel', cancel);
        page.addEventListener('click', click);
        page.addEventListener('keydown', key);
        return () => {
            page.removeEventListener('pointerdown', pointerDown);
            page.removeEventListener('pointercancel', cancel);
            page.removeEventListener('click', click);
            page.removeEventListener('keydown', key);
            finishDrag(true);
        };
    }, [enabled]);

    useLayoutEffect(() => {
        const root = layer.current;
        if (!root) return;
        root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(input => {
            input.style.height = '0px';
            input.style.height = `${Math.min(144, Math.max(32, input.scrollHeight + 2))}px`;
        });
        setNotes(previous => {
            let changed = false;
            const next = previous.map(note => {
                const position = containNote(note, noteSize(note.id));
                if (position.x === note.x && position.y === note.y) return note;
                changed = true;
                return { ...note, ...position };
            });
            return changed ? next : previous;
        });
        if (focusNext.current !== null) {
            root.querySelector<HTMLTextAreaElement>(`[data-note-id="${focusNext.current}"] textarea`)?.focus({ preventScroll: true });
            focusNext.current = null;
        }
    }, [notes]);

    useEffect(() => {
        const root = layer.current;
        if (!root) return;
        const observer = new ResizeObserver(() => {
            if (!root.clientWidth || !root.clientHeight) return;
            setNotes(previous => {
                let changed = false;
                const next = previous.map(note => {
                    const position = containNote(note, noteSize(note.id));
                    if (position.x === note.x && position.y === note.y) return note;
                    changed = true;
                    return { ...note, ...position };
                });
                return changed ? next : previous;
            });
        });
        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    return <div ref={layer} className="notebook-freewriting" data-writing-team={team} data-enabled={enabled}>
        <svg ref={coordinates} className="notebook-writing-coordinates" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" />
        {notes.map(note => <div key={note.id} className="notebook-written-note" data-note-id={note.id}
            data-selected={selected === note.id} style={{ left: `${note.x}%`, top: `${note.y}%`, width: `${note.width ?? 48}%` }}
            onFocus={() => setSelected(note.id)} onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSelected(current => current === note.id ? null : current);
            }}>
            <textarea rows={1} value={note.text} aria-label={t('文字批注')} readOnly={!enabled} tabIndex={enabled ? 0 : -1}
                onChange={event => setNotes(previous => previous.map(item => item.id === note.id ? { ...item, text: event.target.value } : item))} />
            <div className="notebook-writing-handles">
                <button type="button" className="notebook-note-grip" aria-label={t('移动文字')} title={t('移动文字')}
                    disabled={!enabled} onPointerDown={event => startDrag(event, note)} onPointerMove={event => {
                        const active = drag.current;
                        if (!active || active.pointer !== event.pointerId) return;
                        const point = paperPoint(event.clientX, event.clientY);
                        if (!point) return;
                        event.preventDefault();
                        const position = moveNote(active.origin, active.start, point, noteSize(active.id));
                        setNotes(previous => previous.map(item => item.id === active.id ? { ...item, ...position } : item));
                    }} onPointerUp={event => { if (drag.current?.pointer === event.pointerId) finishDrag(false); }}
                    onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) finishDrag(true); }}
                    onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) finishDrag(true); }}
                    onKeyDown={event => {
                        const axes: Record<string, PaperPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
                        const axis = axes[event.key];
                        if (!axis) return;
                        event.preventDefault();
                        const step = event.shiftKey ? 5 : 1;
                        const position = containNote({ x: note.x + axis.x * step, y: note.y + axis.y * step }, noteSize(note.id));
                        setNotes(previous => previous.map(item => item.id === note.id ? { ...item, ...position } : item));
                    }}>
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12M5 5l3-3 3 3M5 11l3 3 3-3M5 5 2 8l3 3M11 5l3 3-3 3" /></svg>
                </button>
                <button type="button" className="notebook-note-delete" aria-label={t('删除文字')} title={t('删除文字')} disabled={!enabled}
                    onClick={() => {
                        setNotes(previous => previous.filter(item => item.id !== note.id));
                        setSelected(null);
                        layer.current?.closest<HTMLElement>('.notebook-page')?.focus({ preventScroll: true });
                    }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
            </div>
        </div>)}
    </div>;
}
