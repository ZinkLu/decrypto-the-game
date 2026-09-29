import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { archiveRows, word, type StationState } from './model';
import { translate } from './i18n';
import { attachNotebookTurn, turnNotebookPage } from './page-turn';
import NotebookTools from './NotebookTools';
import NotebookWriting from './NotebookWriting';
import { appendInkPoints, inkPointerSamples, type InkPoint as Point } from './notebook-ink';
import './page-turn.css';

type Team = 'A' | 'B';
type Tool = 'view' | 'type' | 'pen' | 'eraser';
type Stroke = { id: number; points: Point[] };
type Ink = Record<Team, Stroke[]>;
type Notes = Record<Team, string[]> & { page?: Team; guesses?: Partial<Record<Team, string[]>> };
type Gesture = {
    pointer: number;
    team: Team;
    tool: 'pen' | 'eraser';
    before: Ink;
    surface: SVGSVGElement;
    stroke: number;
};

function pointsOnPaper(event: PointerEvent<SVGSVGElement>): Point[] {
    // The inverse screen matrix accounts for the book's CSS rotation/skew and its SVG scale.
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return [];
    try {
        const inverse = matrix.inverse();
        return appendInkPoints([], inkPointerSamples(event.nativeEvent).flatMap(sample => {
            const point = new DOMPoint(sample.clientX, sample.clientY).matrixTransform(inverse);
            return Number.isFinite(point.x) && Number.isFinite(point.y)
                ? [{ x: Math.max(0, Math.min(400, point.x)), y: Math.max(0, Math.min(580, point.y)) }] : [];
        }));
    } catch { return []; }
}

function segmentDistance(point: Point, a: Point, b: Point) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const squareLength = dx * dx + dy * dy;
    const position = squareLength ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squareLength)) : 0;
    return Math.hypot(point.x - a.x - position * dx, point.y - a.y - position * dy);
}

function eraseNearest(ink: Ink, team: Team, point: Point): Ink {
    let nearest = -1, distance = 13;
    ink[team].forEach((stroke, index) => {
        for (let i = 0; i < stroke.points.length; i++) {
            const next = segmentDistance(point, stroke.points[i], stroke.points[Math.max(0, i - 1)]);
            if (next < distance) { nearest = index; distance = next; }
        }
    });
    return nearest < 0 ? ink : { ...ink, [team]: ink[team].filter((_, index) => index !== nearest) };
}

function strokePath(points: Point[]) {
    if (points.length === 1) return `M${points[0].x},${points[0].y}l.01,.01`;
    return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export default function FieldNotebook({ state, locale }: { state: StationState; locale: 'zh' | 'en' }) {
    const t = (message: string, values?: unknown[]) => translate(locale, message, values);
    const [tool, setTool] = useState<Tool>('type');
    const [notes, setNotes] = useState<Notes>({ A: ['', '', '', '', ''], B: ['', '', '', '', ''] });
    const [ink, setInk] = useState<Ink>({ A: [], B: [] });
    const [undo, setUndo] = useState<Ink[]>([]);
    const inkRef = useRef(ink);
    const gesture = useRef<Gesture | null>(null);
    const nextStroke = useRef(0);
    const pages: Team[] = state.myTeam === 'B' ? ['B', 'A'] : ['A', 'B'];
    const currentPage = notes.page ?? pages[0];
    const nextPage = pages.find(team => team !== currentPage)!;
    const canType = tool === 'type' || tool === 'view';
    const rows = archiveRows(state, 'all').reverse();

    const applyInk = (next: Ink) => { inkRef.current = next; setInk(next); };
    const releaseGesture = (cancelled: boolean) => {
        const active = gesture.current;
        if (!active) return;
        gesture.current = null;
        if (cancelled) applyInk(active.before);
        else if (inkRef.current !== active.before) setUndo(previous => [...previous.slice(-49), active.before]);
        if (active.surface.hasPointerCapture(active.pointer)) active.surface.releasePointerCapture(active.pointer);
    };

    useEffect(() => () => {
        const active = gesture.current;
        gesture.current = null;
        if (active?.surface.hasPointerCapture(active.pointer)) active.surface.releasePointerCapture(active.pointer);
    }, []);

    function startDrawing(event: PointerEvent<SVGSVGElement>, team: Team) {
        if (event.currentTarget.closest('[data-page-turn="true"]') || gesture.current || !event.isPrimary || event.button !== 0 || tool !== 'pen' && tool !== 'eraser') return;
        const point = pointsOnPaper(event).at(-1);
        if (!point) return;
        event.preventDefault();
        const id = ++nextStroke.current;
        const before = inkRef.current;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { pointer: event.pointerId, team, tool, before, surface: event.currentTarget, stroke: id };
        applyInk(tool === 'pen' ? { ...before, [team]: [...before[team], { id, points: [point] }] } : eraseNearest(before, team, point));
    }

    function moveDrawing(event: PointerEvent<SVGSVGElement>) {
        const active = gesture.current;
        if (!active || active.pointer !== event.pointerId) return;
        const samples = pointsOnPaper(event);
        if (!samples.length) return;
        event.preventDefault();
        const current = inkRef.current;
        if (active.tool === 'eraser') {
            const next = samples.reduce((remaining, point) => eraseNearest(remaining, active.team, point), current);
            if (next !== current) applyInk(next);
            return;
        }
        const stroke = current[active.team].find(item => item.id === active.stroke);
        if (!stroke) return;
        const points = appendInkPoints(stroke.points, samples);
        if (points === stroke.points) return;
        applyInk({ ...current, [active.team]: current[active.team].map(item => item.id === active.stroke ? { ...item, points } : item) });
    }

    function updateGuess(team: Team, index: number, value: string) {
        setNotes(previous => ({ ...previous, guesses: { ...previous.guesses,
            [team]: [0, 1, 2, 3].map(i => index === i ? value : previous.guesses?.[team]?.[i] ?? ''),
        } }));
    }

    return <aside id="archive-notebook" ref={attachNotebookTurn} className="field-notebook" data-tool={tool} aria-label={t('记录板')}>
        <NotebookTools tool={tool} locale={locale} canUndo={!!undo.length}
            onToolChange={choice => { releaseGesture(true); setTool(choice); }}
            onUndo={() => { releaseGesture(true); const previous = undo[undo.length - 1]; if (previous) { applyInk(previous); setUndo(items => items.slice(0, -1)); } }} />
        <div className="notebook-cover">
            <div className="notebook-clip" aria-hidden="true" />
            <div className="notebook-spread">
                {pages.map((team, page) => {
                    const owner = state.myTeam ? t(team === state.myTeam ? '我方' : '对方') : t('{0} 队', [team]);
                    const groups = [1, 2, 3, 4].map(number => rows.filter(row => row.team === team && row.secret?.length === 3)
                        .flatMap(row => row.secret!.flatMap((digit, index) => digit === number && row.clues[index] ? [{ clue: row.clues[index], round: row.round }] : [])));
                    return <section className="notebook-page" data-team={team} key={team} hidden={team !== currentPage} tabIndex={canType ? 0 : -1} aria-label={t('{0}的线索笔记', [owner])}>
                        <header className="notebook-page-header">
                            <h3>{owner}</h3>
                            <span className="notebook-team-code">{t('{0} 队', [team])}</span>
                        </header>
                        <div className="notebook-page-content">
                            <ol className="notebook-entries">
                                {groups.map((clues, index) => <li className="notebook-entry" key={index}>
                                    <div className="notebook-entry-title">
                                        <span className="notebook-number" aria-label={t('词号 {0}', [index + 1])}>{String(index + 1).padStart(2, '0')}</span>
                                        {team === state.myTeam && state.myWords[index] && <strong className="notebook-keyword">{word(state.myWords[index], locale)}</strong>}
                                        {team !== state.myTeam && <input className="notebook-keyword-guess" type="text" placeholder={t('未知')}
                                            value={notes.guesses?.[team]?.[index] ?? ''} autoComplete="off" spellCheck={false}
                                            aria-label={t('{0} · 词号 {1} 的密词推测', [owner, index + 1])}
                                            onChange={event => updateGuess(team, index, event.target.value)} />}
                                    </div>
                                    <div className="notebook-entry-body">
                                        <div className="notebook-clues" tabIndex={clues.length > 3 && (tool === 'view' || tool === 'type') ? 0 : -1}>
                                            {clues.map((entry, i) => <span className="notebook-clue" key={`${entry.round}-${i}`}>
                                                <span>{entry.clue}</span><small title={t('第 {0} 回合', [entry.round])}>{String(entry.round).padStart(2, '0')}</small>
                                            </span>)}
                                        </div>
                                    </div>
                                </li>)}
                            </ol>
                            <svg className="notebook-ink" viewBox="0 0 400 580" preserveAspectRatio="none" aria-hidden="true"
                                style={{ pointerEvents: tool === 'pen' || tool === 'eraser' ? 'auto' : 'none', touchAction: 'none' }}
                                onPointerDown={event => startDrawing(event, team)} onPointerMove={moveDrawing}
                                onPointerUp={event => { if (gesture.current?.pointer === event.pointerId) { moveDrawing(event); releaseGesture(false); } }}
                                onPointerCancel={event => { if (gesture.current?.pointer === event.pointerId) releaseGesture(false); }}
                                onLostPointerCapture={event => { if (gesture.current?.pointer === event.pointerId) releaseGesture(false); }}>
                                {ink[team].map(stroke => <path key={stroke.id} d={strokePath(stroke.points)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />)}
                            </svg>
                        </div>
                        <NotebookWriting team={team} locale={locale} enabled={canType} initialNotes={notes[team]} />
                        <footer className="notebook-page-footer"><span>{String(page + 1).padStart(2, '0')}</span><i className="notebook-curl" aria-hidden="true" /></footer>
                    </section>;
                })}
                <button type="button" className="notebook-flip-edge"
                    aria-label={t('翻到{0}', [state.myTeam ? t(nextPage === state.myTeam ? '我方' : '对方') : t('{0} 队', [nextPage])])}
                    title={t('翻到{0}', [state.myTeam ? t(nextPage === state.myTeam ? '我方' : '对方') : t('{0} 队', [nextPage])])}
                    onClick={event => {
                        releaseGesture(false);
                        turnNotebookPage(event.currentTarget.closest<HTMLElement>('.field-notebook')!, pages[0], currentPage, nextPage);
                        setNotes(previous => ({ ...previous, page: nextPage }));
                    }} />
            </div>
        </div>
    </aside>;
}
