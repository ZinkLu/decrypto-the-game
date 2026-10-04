import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { diskInscription, keyDiskDurations, type KeyDiskState } from './model';
import { diskIntroPreview } from './options';
import { translate, type Locale } from './i18n';
import './encryptorIntro.css';

/** A brief role announcement; the desktop disk itself remains the modeled prop. */
export default function EncryptorIntro({ disk, round, locale, reduced }: {
    disk: KeyDiskState; round: number; locale: Locale; reduced: boolean;
}) {
    const surface = useRef<HTMLDivElement>(null);
    const t = (message: string, values?: unknown[]) => translate(locale, message, values);
    const inscription = diskInscription(disk.id);
    const initialElapsed = useRef(Math.max(0, (disk.pausedAt ?? performance.now()) - disk.startedAt));
    useLayoutEffect(() => {
        // The portable prop returns to its real drive, including after a resize.
        const position = () => {
            const slot = document.querySelector('.mobile-disk-mechanism')?.getBoundingClientRect();
            if (!slot || !slot.width) return;
            surface.current?.style.setProperty('--intro-dock-x', `${slot.left + slot.width / 2 + 96 - innerWidth / 2}px`);
            surface.current?.style.setProperty('--intro-dock-y', `${slot.top + 23 - innerHeight * (innerHeight <= 640 ? .64 : .5)}px`);
        };
        position();
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, { passive: true });
        return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position); };
    }, []);
    return <div ref={surface} className="encryptor-intro" data-reduced={reduced || undefined} data-held={diskIntroPreview || undefined} data-paused={disk.pausedAt !== undefined || undefined}
        style={{ '--intro-duration': `${keyDiskDurations.announcing}ms`, '--intro-delay': `-${initialElapsed.current}ms` } as CSSProperties}>
        <div className="encryptor-intro-copy">
            <span>{t('第 {0} 回合 · 本轮身份', [round])}</span>
            <h2>{t('你是加密者')}</h2>
            <p>{t('本轮由你给出三条线索')}</p>
        </div>
        <div className="encryptor-intro-prop" aria-hidden="true">
            <div className="mobile-floppy"><i/><span><b style={{ color: inscription.ink, fontSize: inscription.text.length > 11 ? '11px' : undefined }}>{inscription.text}</b><small>KEY / {String(round).padStart(2, '0')}</small></span></div>
        </div>
    </div>;
}
