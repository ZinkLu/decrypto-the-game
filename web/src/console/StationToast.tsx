import { useEffect, useRef, useState } from 'react';
import './station-notices.css';

export type Translate = (message: string, values?: unknown[]) => string;

interface Props {
    message: string;
    onClose?: () => void;
    t: Translate;
    duration?: number;
}

/** A short notice that leaves enough time to read, including while focused. */
export default function StationToast({ message, onClose, t, duration = 6000 }: Props) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const close = useRef(onClose);
    close.current = onClose;
    const clock = useRef({ message, duration, remaining: duration });
    useEffect(() => {
        if (clock.current.message !== message || clock.current.duration !== duration)
            clock.current = { message, duration, remaining: duration };
        if (hovered || focused || duration <= 0 || !close.current) return;
        const started = performance.now();
        const timer = window.setTimeout(() => close.current?.(), clock.current.remaining);
        return () => {
            window.clearTimeout(timer);
            clock.current.remaining = Math.max(0, clock.current.remaining - (performance.now() - started));
        };
    }, [message, duration, hovered, focused]);

    return <div className="station-notice station-toast"
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      {onClose && <button type="button" className="station-notice-dismiss" aria-label={t('关闭提示')} onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>}
    </div>;
}
