import { useLayoutEffect, useRef, useState } from 'react';
import { archiveRows, type StationState } from './model';
import type { PaperOrigin } from './mechanics';
import { emptyNotes, parseNotes, type Notes } from './notebook';

interface Props { open: boolean; origin?: PaperOrigin; state: StationState; storageKey: string; onClose: () => void; onClosed: () => void }
export default function ArchiveSheet({ open, origin, state, storageKey, onClose, onClosed }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [team, setTeam] = useState('all');
    const [storageFailed, setStorageFailed] = useState(false);
    const [notes, setNotes] = useState<Notes>(() => {
        try { return parseNotes(localStorage.getItem(storageKey)); }
        catch { return emptyNotes(); }
    });
    const rows = archiveRows(state, team);
    function save(next: Notes) {
        setNotes(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageFailed(false); }
        catch { setStorageFailed(true); }
    }
    useLayoutEffect(() => {
        const el = dialog.current!;
        if (open) {
            if (!el.open) el.showModal();
            const sheet = el.querySelector<HTMLElement>('.archive-sheet')!;
            // Measure the resting sheet before its entrance transform is applied.
            sheet.style.animation = 'none';
            const bounds = sheet.getBoundingClientRect();
            sheet.style.setProperty('--archive-from-x', `${origin ? origin.left - bounds.left : 0}px`);
            sheet.style.setProperty('--archive-from-y', `${origin ? origin.top - bounds.top : -48}px`);
            sheet.style.setProperty('--archive-from-scale', `${origin ? Math.max(.12, origin.width / bounds.width) : 1}`);
            sheet.style.animation = '';
            const previous = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = previous; };
        }
        if (!el.open) return;
        const timer = window.setTimeout(() => el.close(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
        return () => clearTimeout(timer);
    }, [open, origin]);
    return <dialog ref={dialog} className="archive-dialog" data-open={open} aria-labelledby="archive-title"
        onClose={onClosed}
        onCancel={e => { e.preventDefault(); onClose(); }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <article className="archive-sheet">
            <header className="archive-header">
                <div><p className="archive-eyebrow">回合留底 <span>{state.roomCode || '待接入'}</span></p>
                    <h2 id="archive-title">密报记录</h2>
                    </div>
                <button className="archive-close" onClick={onClose} autoFocus aria-label="收起密报档案">收起 <span aria-hidden="true">↑</span></button>
            </header>
            <div className="archive-body">
                <section className="archive-records" aria-label="公开回合记录">
                    <div className="archive-toolbar">
                        <div className="archive-filters" role="group" aria-label="按队伍筛选">
                            {['all', 'A', 'B'].map(t => <button key={t} aria-pressed={team === t} onClick={() => setTeam(t)}>{t === 'all' ? '全部密报' : `${t} 队`}</button>)}
                        </div><span className="archive-count">{rows.length} 回合</span>
                    </div>
                    {!rows.length ? <div className="archive-empty"><span aria-hidden="true">— 00 —</span><h3>等待第一份密报</h3>
                        <p>回合结束后，公开线索会留在这里。</p></div> : rows.map(row => <article className="archive-record" key={row.round}>
                        <header><h3><span className="archive-round">{String(row.round).padStart(2, '0')}</span>第 {row.round} 回合</h3><span className={`archive-team team-${row.team}`}>{row.team} 队发报</span></header>
                        <ol className="archive-clues">{row.clues.map((clue, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><strong>{clue}</strong><b aria-label={`对应编号 ${row.secret?.[i] || '未公开'}`}>{row.secret?.[i] || '—'}</b></li>)}</ol>
                        <details className="archive-details"><summary>结果与批注</summary><p className="archive-result">公开密码 <strong>{row.secret?.join(' · ') || '尚未公开'}</strong><span>截获 {row.intercept?.some(Boolean) ? row.intercept.join(' · ') : '—'}</span><span>解码 {row.decrypt?.some(Boolean) ? row.decrypt.join(' · ') : '—'}</span></p>
                        <label className="round-note">页边批注<textarea aria-label={`第 ${row.round} 回合笔记`} rows={2} maxLength={2000} placeholder="这组线索让我想到……" value={notes.rounds[row.round] || ''}
                            onChange={e => save({ ...notes, rounds: { ...notes.rounds, [row.round]: e.target.value } })}/></label>
                    </details></article>)}
                    
                </section>
                <details className="archive-notebook"><summary>我的笔记 <span>仅自己可见</span></summary>
                    
                    <label className="sr-only" htmlFor="field-notes">我的推理笔记</label>
                    
                    <textarea id="field-notes" maxLength={10000} placeholder={'例如：\nB 队的 4 号词，也许和旅行有关。\n“远行”和“羽毛”有没有共同的方向？'} value={notes.general} onChange={e => save({ ...notes, general: e.target.value })}/>
                    <div className="notebook-status"><span role="status">{storageFailed ? '本机保存失败，请先复制笔记留存。' : '自动保存在当前浏览器'}</span><span>{notes.general.length} / 10000</span></div>
                </details>
            </div>
        </article>
    </dialog>;
}
