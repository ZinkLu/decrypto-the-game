import { useLayoutEffect, useRef, useState } from 'react';
import { translate } from './i18n';
import { ArchiveViewMotion, type ArchiveView } from './archive-view-motion';
import './archive-view-motion.css';

export default function ArchiveViews({ locale }: { locale: 'zh' | 'en' }) {
    const [view, setView] = useState<ArchiveView>('both');
    const controls = useRef<HTMLDivElement>(null);
    const motion = useRef<ArchiveViewMotion | null>(null);
    const t = (message: string) => translate(locale, message);

    useLayoutEffect(() => {
        const archive = controls.current?.closest('dialog');
        if (!archive) return;
        const controller = new ArchiveViewMotion(archive);
        motion.current = controller;
        setView(controller.view);
        return () => { controller.dispose(); motion.current = null; };
    // Recreate only this motion controller when its module changes during a preview.
    // The two record surfaces and their in-memory notes remain mounted.
    }, [ArchiveViewMotion]);

    return <div ref={controls} className="archive-views" role="group" aria-label={t('显示内容')}>
        {(['notebook', 'receipt'] as const).map(item => {
            const visible = view === 'both' || view === item;
            return <button type="button" key={item} aria-pressed={visible}
                aria-controls={item === 'notebook' ? 'archive-notebook' : 'archive-receipt'}
                title={t(item === 'notebook' ? visible ? '隐藏记录板' : '显示记录板' : visible ? '隐藏纸条' : '显示纸条')}
                onClick={() => { if (motion.current) setView(motion.current.toggle(item)); }}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d={item === 'notebook'
                    ? 'M7 4H4v14h12V4h-3M7 2h6v4H7zM7 10h6M7 13h6'
                    : 'M5 2h10v16l-2-1-3 1-3-1-2 1zM8 6h4M8 9h4M8 12h4'} /></svg>
                {t(item === 'notebook' ? '记录板' : '纸条')}
            </button>;
        })}
    </div>;
}
