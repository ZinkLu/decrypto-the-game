import { translate } from './i18n';
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { archiveRows, type StationState } from './model';
import { paperFeedDuration } from './mechanics';
import FieldNotebook from './FieldNotebook';
import ArchiveViews from './ArchiveViews';
import './notebook.css';

const motionRate = import.meta.env.DEV && new URLSearchParams(location.search).get('motion') === 'slow' ? .2 : 1;
const enterDuration = paperFeedDuration / motionRate;
// Return control promptly; the printer finishes tearing its physical sheet underneath.
const exitDuration = 200 / motionRate;

interface Props { locale: 'zh' | 'en'; open: boolean; state: StationState; onClose: () => void; onClosed: () => void; onVisibilityChange: (shown: boolean) => void }

function sequence(values?: number[], late = '') {
    return values?.some(Boolean) ? values.join(' — ') : late || '— — —';
}

function matches(actual?: number[], guess?: number[]) {
    return !!actual?.length && actual.length === guess?.length && actual.every((value, index) => value === guess?.[index]);
}

export default function ArchiveSheet({ open, state, onClose, onClosed, onVisibilityChange, locale }: Props) {
    const t = (message: string, values?: unknown[]) => translate(locale, message, values);
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
            sheet.style.setProperty('--archive-exit-opacity', pose.opacity);
            dialog.current!.style.setProperty('--archive-backdrop-exit-opacity', getComputedStyle(dialog.current!, '::backdrop').opacity);
        }
        const book = dialog.current?.querySelector<HTMLElement>('.field-notebook');
        if (book) {
            const pose = getComputedStyle(book);
            book.style.setProperty('--notebook-exit-transform', pose.transform === 'none' ? 'translate(0, 0)' : pose.transform);
            book.style.setProperty('--notebook-exit-opacity', pose.opacity);
        }
        onClose();
    }

    useLayoutEffect(() => {
        const el = dialog.current!;
        if (open) {
            const previous = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            if (!el.open) el.showModal();
            onVisibilityChange(true);
            el.scrollTop = 0;
            el.querySelector<HTMLButtonElement>('.archive-dismiss')?.focus({ preventScroll: true });
            return () => { document.body.style.overflow = previous; };
        }
        if (!el.open) return;
        const timer = window.setTimeout(() => el.close(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : exitDuration);
        return () => clearTimeout(timer);
    }, [open]);
    useLayoutEffect(() => () => onVisibilityChange(false), [onVisibilityChange]);

    return <dialog ref={dialog} className="archive-dialog archive-study" data-open={open} aria-labelledby="archive-title"
        style={{ '--archive-enter-duration': `${enterDuration}ms`, '--archive-exit-duration': `${exitDuration}ms` } as CSSProperties}
        onClose={() => { onVisibilityChange(false); onClosed(); }}
        onCancel={event => { event.preventDefault(); requestClose(); }}
        onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
        <div className="archive-paper-track" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
        <FieldNotebook state={state} locale={locale}/>
        <div id="archive-receipt" className="archive-receipt-track" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
        <article className="archive-sheet">
            <header className="archive-header">
                <div>
                    <p className="archive-eyebrow">{t("密报记录")}<span>CH {state.roomCode || t("待接入")}</span></p>
                    <h2 id="archive-title">{t("密报记录")}</h2>
                    <p className="receipt-subtitle">{t("公开线索 · 猜测次序 · 回合留底")}</p>
                </div>
            </header>
            <div className="archive-body">
                <section className="archive-records" aria-label={t("公开回合记录")}>
                    <p className="archive-ledger-head"><span>{String(rows.length).padStart(2, '0')} {t("条记录")}</span><span>{t("按时间顺序")}</span></p>
                    {!rows.length ? <div className="archive-empty"><span aria-hidden="true">— 00 —</span><h3>{t("等待第一份密报")}</h3>
                        <p>{t("回合结束后，公开线索与双方提交的次序会自动打印。")}</p></div> : rows.map(row => {
                        const ours = row.team === state.myTeam;
                        const interceptOwner = ours ? t("对方") : t("我方");
                        const decryptOwner = ours ? t("我方") : t("对方");
                        const interceptSuccess = matches(row.secret, row.intercept);
                        const decryptSuccess = matches(row.secret, row.decrypt);
                        return <article className="archive-record" key={row.round}>
                            <header>
                                <h3><span className="archive-round">{String(row.round).padStart(2, '0')}</span>{t('第 {0} 回合', [row.round])}</h3>
                                <span className={`archive-team team-${row.team}`}>{ours ? t("我方") : t("对方")} · {t('{0} 队发报', [row.team])}</span>
                            </header>
                            <p className="archive-clue-line">{row.clues.map((clue, index) => <span key={index}><small>{String(index + 1).padStart(2, '0')}</small>{clue}</span>)}</p>
                            <dl className="archive-sequences">
                                <div><dt>{interceptOwner} · {t('截获')}</dt><dd>{sequence(row.intercept, row.timeouts?.includes('intercept') ? t('超时未提交') : '')}</dd></div>
                                <div><dt>{decryptOwner} · {t('解码')}</dt><dd>{sequence(row.decrypt, row.timeouts?.includes('decrypt') ? t('超时未提交') : '')}</dd></div>
                                <div className="archive-secret"><dt>{t("公开密码")}</dt><dd>{sequence(row.secret)}</dd></div>
                            </dl>
                            <p className="archive-outcome">
                                {row.timeouts?.includes('encrypt') && <span data-result="failure">{t('发报超时')}</span>}
                                {row.intercept?.some(Boolean) && <span data-result={interceptSuccess ? 'success' : 'failure'} data-scoring={interceptSuccess || undefined}>{t('截获')} · {interceptSuccess ? t("成功") : t("失败")}</span>}
                                {(row.decrypt?.some(Boolean) || row.timeouts?.includes('decrypt')) && <span data-result={decryptSuccess ? 'success' : 'failure'} data-scoring={!decryptSuccess || undefined}>{t('解码')} · {decryptSuccess ? t("成功") : t("失败")}</span>}
                            </p>
                        </article>;
                    })}
                </section>
            </div>
            <footer className="receipt-footer"><span aria-hidden="true">▎▍▏▌▍▎▏▍▌▏▎▍▏▌▍▎▏▍▌▎▍▏</span><p>{t("通信结束 ·")}{String(rows.length).padStart(2, '0')}</p></footer>
        </article>
        </div>
        </div>
        <button className="archive-dismiss" onClick={requestClose} aria-label={t("收起密报记录")}>{t("收起记录")}<span aria-hidden="true">×</span></button>
        <ArchiveViews locale={locale}/>
    </dialog>;
}
