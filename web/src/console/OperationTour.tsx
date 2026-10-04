import { useEffect, useMemo, useRef, useState } from 'react';
import { readTourProgress, saveTourProgress, tourSteps, type TourContext, type TourStep } from './onboarding';
import TourSpotlight from './TourSpotlight';
import type { SpotlightRect } from './spotlight';
import './operation-tour.css';

type Props = TourContext & { enabled: boolean; autoStart: boolean; persist: boolean; replay: number; compactWords: boolean;
    measureRegion: (step: string) => SpotlightRect[];
    t: (message: string, values?: unknown[]) => string };

export default function OperationTour({ home, words, voice, enabled, autoStart, persist, replay, compactWords, measureRegion, t }: Props) {
    const [progress, setProgress] = useState(() => persist ? readTourProgress() : { seen: [], dismissed: false });
    const [steps, setSteps] = useState<TourStep[]>([]);
    const [index, setIndex] = useState(0);
    const [compact, setCompact] = useState(() => matchMedia('(max-width: 850px)').matches);
    const [targetFound, setTargetFound] = useState(false);
    const replayed = useRef(replay);
    const focusReplay = useRef(false);
    const previousHome = useRef(home);
    const available = useMemo(() => tourSteps({ home, words: words && (!compact || compactWords), voice }), [home, words, voice, compact, compactWords]);
    const step = steps[index];
    const card = useRef<HTMLElement>(null);
    const nextButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const media = matchMedia('(max-width: 850px)');
        const update = () => setCompact(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    useEffect(() => {
        if (persist) saveTourProgress(progress);
    }, [progress, persist]);
    useEffect(() => {
        if (!enabled) return;
        const replayRequested = replayed.current !== replay;
        const contextChanged = previousHome.current !== home;
        replayed.current = replay;
        previousHome.current = home;
        if (steps.length && !replayRequested && !contextChanged) {
            const kept = steps.filter(item => available.some(candidate => candidate.id === item.id));
            if (kept.length !== steps.length) {
                const nextIndex = index - steps.slice(0, index).filter(item => !kept.includes(item)).length;
                setSteps(nextIndex < kept.length ? kept : []);
                setIndex(nextIndex < kept.length ? nextIndex : 0);
            }
            return;
        }
        if (replayRequested) focusReplay.current = true;
        const next = replayRequested ? available : autoStart && !progress.dismissed ? available.filter(item => !progress.seen.includes(item.id)) : [];
        if (next.length || steps.length) { setSteps(next); setIndex(0); }
    }, [enabled, replay, home, available, autoStart, progress, steps, index]);
    useEffect(() => {
        if (!enabled || !step) return;
        if (focusReplay.current) { nextButton.current?.focus({ preventScroll: true }); focusReplay.current = false; }
        const candidates = document.querySelectorAll<HTMLElement>(compact ? step.compactTarget : step.target);
        const targets = Array.from(candidates).filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        setTargetFound(targets.length > 0);
        for (const target of targets) target.dataset.tourTarget = 'true';
        if (compact) targets[0]?.scrollIntoView({ block: 'center', behavior: 'instant' });
        return () => { for (const target of targets) delete target.dataset.tourTarget; };
    }, [step, compact, enabled, replay]);
    function close(skip: boolean) {
        const ownsFocus = card.current?.contains(document.activeElement);
        setProgress(old => ({ seen: Array.from(new Set([...old.seen, ...steps.map(item => item.id)])), dismissed: old.dismissed || skip }));
        setSteps([]);
        if (ownsFocus) document.querySelector<HTMLButtonElement>('[data-tour-replay]')?.focus({ preventScroll: true });
    }
    function next() {
        if (index + 1 === steps.length) { close(false); return; }
        setProgress(old => ({ ...old, seen: Array.from(new Set([...old.seen, step.id])) }));
        setIndex(index + 1);
        nextButton.current?.focus({ preventScroll: true });
    }
    if (!enabled || !step) return null;
    return <><section ref={card} className="station-notice station-tour" aria-label={t('操作提示')} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    }}>
        <div className="station-tour-copy" role="status" aria-live="polite" aria-atomic="true">
            <header><h2>{t(step.title)}</h2><span aria-label={t('第 {0} 步，共 {1} 步', [index + 1, steps.length])}>{index + 1} / {steps.length}</span></header>
            <p>{t(compact ? step.mobile : step.body)}</p>
            {!targetFound && <span className="sr-only">{t('功能可用时会显示对应控件。')}</span>}
        </div>
        <footer><button type="button" onClick={() => close(true)}>{t('跳过提示')}</button>
            <button ref={nextButton} type="button" className="station-tour-next" onClick={next}>{t(index + 1 === steps.length ? '知道了' : '下一步')}</button></footer>
    </section>
    <TourSpotlight key={`${step.id}:${compact}`} selector={compact ? step.compactTarget : step.target} card={card}
        measure={compact ? undefined : () => measureRegion(step.id)}/>
    </>;
}
