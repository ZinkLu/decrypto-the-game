import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { archiveRows, type StationState } from './model';
import { paperFeedDuration, paperTearDuration } from './mechanics';

const motionRate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
const enterDuration = paperFeedDuration / motionRate;
const exitDuration = paperTearDuration / motionRate;

interface Props { open: boolean; state: StationState; onClose: () => void; onClosed: () => void }

function sequence(values?: number[]) {
    return values?.some(Boolean) ? values.join(' — ') : '— — —';
}

function matches(actual?: number[], guess?: number[]) {
    return !!actual?.length && actual.length === guess?.length && actual.every((value, index) => value === guess?.[index]);
}

export default function ArchiveSheet({ open, state, onClose, onClosed }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    // A printer roll reads from the oldest impression at the top to the newest at the tear.
    const rows = archiveRows(state, 'all').slice().reverse();

    function requestClose() {
        if (!open) return;
        const sheet = dialog.current?.querySelector<HTMLElement>('.archive-sheet');
        if (sheet) {
            // An early dismissal slides down from the current position.
            const pose = getComputedStyle(sheet);
            sheet.style.setProperty('--archive-exit-transform', pose.transform === 'none' ? 'translate(0, 0)' : pose.transform);
            dialog.current!.style.setProperty('--archive-backdrop-exit-opacity', getComputedStyle(dialog.current!, '::backdrop').opacity);
        }
        onClose();
    }

    useLayoutEffect(() => {
        const el = dialog.current!;
        if (open) {
            const previous = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            if (!el.open) el.showModal();
            el.scrollTop = 0;
            el.querySelector<HTMLButtonElement>('.archive-dismiss')?.focus({ preventScroll: true });
            return () => { document.body.style.overflow = previous; };
        }
        if (!el.open) return;
        const timer = window.setTimeout(() => el.close(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : exitDuration);
        return () => clearTimeout(timer);
    }, [open]);

    return <dialog ref={dialog} className="archive-dialog" data-open={open} aria-labelledby="archive-title"
        style={{ '--archive-enter-duration': `${enterDuration}ms`, '--archive-exit-duration': `${exitDuration}ms` } as CSSProperties}
        onClose={onClosed}
        onCancel={event => { event.preventDefault(); requestClose(); }}
        onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
        <div className="archive-paper-track" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
        <article className="archive-sheet">
            <header className="archive-header">
                <div>
                    <p className="archive-eyebrow">MESSAGE RECORDER <span>CH {state.roomCode || '待接入'}</span></p>
                    <h2 id="archive-title">密报记录</h2>
                    <p className="receipt-subtitle">公开线索 · 猜测次序 · 回合留底</p>
                </div>
            </header>
            <div className="archive-body">
                <section className="archive-records" aria-label="公开回合记录">
                    <p className="archive-ledger-head"><span>{String(rows.length).padStart(2, '0')} RECORDS</span><span>OLDEST → LATEST</span></p>
                    {!rows.length ? <div className="archive-empty"><span aria-hidden="true">— 00 —</span><h3>等待第一份密报</h3>
                        <p>回合结束后，公开线索与双方提交的次序会自动打印。</p></div> : rows.map(row => {
                        const ours = row.team === state.myTeam;
                        const interceptOwner = ours ? '对方' : '我方';
                        const decryptOwner = ours ? '我方' : '对方';
                        const interceptSuccess = matches(row.secret, row.intercept);
                        const decryptSuccess = matches(row.secret, row.decrypt);
                        return <article className="archive-record" key={row.round}>
                            <header>
                                <h3><span className="archive-round">{String(row.round).padStart(2, '0')}</span>第 {row.round} 回合</h3>
                                <span className={`archive-team team-${row.team}`}>{ours ? '我方' : '对方'} · {row.team} 队发报</span>
                            </header>
                            <p className="archive-clue-line">{row.clues.map((clue, index) => <span key={index}><small>{String(index + 1).padStart(2, '0')}</small>{clue}</span>)}</p>
                            <dl className="archive-sequences">
                                <div><dt>{interceptOwner}截获</dt><dd>{sequence(row.intercept)}</dd></div>
                                <div><dt>{decryptOwner}解码</dt><dd>{sequence(row.decrypt)}</dd></div>
                                <div className="archive-secret"><dt>公开密码</dt><dd>{sequence(row.secret)}</dd></div>
                            </dl>
                            <p className="archive-outcome">
                                {row.intercept?.some(Boolean) && <span data-result={interceptSuccess ? 'success' : 'failure'}>截获{interceptSuccess ? '成功' : '失败'}</span>}
                                {row.decrypt?.some(Boolean) && <span data-result={decryptSuccess ? 'success' : 'failure'}>解码{decryptSuccess ? '成功' : '失败'}</span>}
                            </p>
                        </article>;
                    })}
                </section>
            </div>
            <footer className="receipt-footer"><span aria-hidden="true">▎▍▏▌▍▎▏▍▌▏▎▍▏▌▍▎▏▍▌▎▍▏</span><p>END OF TRANSMISSION · {String(rows.length).padStart(2, '0')}</p></footer>
        </article>
        </div>
        <button className="archive-dismiss" onClick={requestClose} aria-label="收起密报记录">收起记录 <span aria-hidden="true">×</span></button>
    </dialog>;
}
