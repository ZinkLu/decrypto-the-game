import { useRef, type PointerEvent, type RefObject } from 'react';
import { instrumentSteps, type LocalState } from './model';
import { intercomPositions } from './voice';
import type { Target } from './paint';
import type { useDiskPull } from './useDiskPull';
import { handleSurfaces, handlePull, handleCommit, type HandleSide } from './view';

type Translate = (message: string, values?: unknown[]) => string;

const knobs = ['scope-tune', 'scope-wave', 'scope-rate', 'scope-xy', 'meter-amplitude', 'meter-rate'];
/** Analog controls: they turn steplessly and never repaint the screens. */
export const isKnob = (id: string) => knobs.includes(id);

interface Machine {
    beginHandle(side: HandleSide): boolean;
    pullHandle(progress: number): void;
    releaseHandle(): void;
}
interface GripOptions {
    machine: () => Machine | null;
    stage: RefObject<HTMLDivElement | null>;
    /** The handle was pulled far enough: the machine turns over. */
    onTurn: (side: HandleSide) => void;
    /** The handle was let go early or the gesture was lost: the machine falls back. */
    onRelease: (deliberate: boolean) => void;
}
/** Pulling a front handle inward turns the machine over; one captured pointer owns the gesture. */
export function useHandleGrip({ machine, stage, onTurn, onRelease }: GripOptions) {
    const drag = useRef<{ id: string; side: HandleSide; x: number; pointerId: number; progress: number } | null>(null);
    function release() {
        drag.current = null;
        machine()?.releaseHandle();
        stage.current?.removeAttribute('data-handling');
    }
    return {
        /** The handle in hand, which stays where the pointer holds it. */
        held: () => drag.current?.id,
        /** Returns whether there was a gesture to cancel. */
        cancel() {
            if (!drag.current) return false;
            release();
            onRelease(false);
            return true;
        },
        onPointerDown(e: PointerEvent<HTMLElement>, id: string) {
            if (e.button !== 0 || id.includes('Rear')) return;
            const side = id.includes('Left') ? 'left' : 'right';
            if (!machine()?.beginHandle(side)) return;
            e.preventDefault();
            drag.current = { id, side, x: e.clientX, pointerId: e.pointerId, progress: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
            stage.current?.setAttribute('data-handling', 'true');
        },
        onPointerMove(e: PointerEvent<HTMLElement>) {
            const held = drag.current;
            if (!held || held.pointerId !== e.pointerId) return;
            held.progress = handlePull(held.side, e.clientX - held.x, stage.current?.clientWidth || 1);
            machine()?.pullHandle(held.progress);
        },
        onPointerUp(e: PointerEvent<HTMLElement>) {
            const held = drag.current;
            if (!held || held.pointerId !== e.pointerId) return;
            release();
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            if (held.progress >= handleCommit) onTurn(held.side);
            else onRelease(true);
        },
        onLostPointerCapture() {
            if (!drag.current) return;
            release();
            onRelease(false);
        },
        onPointerCancel() {
            release();
            onRelease(false);
        },
    };
}

interface Props {
    targets: Target[];
    local: LocalState;
    /** The 3D machine could not start: the controls are laid out as ordinary elements. */
    failed: boolean;
    visible: boolean;
    t: Translate;
    /** The element of every control, by `surface:id`, for the engine to place. */
    nodes: RefObject<Map<string, HTMLElement>>;
    diskPull: ReturnType<typeof useDiskPull>;
    grip: ReturnType<typeof useHandleGrip>;
    onHint: (id: string) => void;
    onFocus: (target: Target) => void;
    onBlur: (target: Target) => void;
    onAct: (id: string) => void;
    onChange: (target: Target, value: string) => void;
    onKnob: (id: string, delta: number, notches?: boolean) => void;
}

/**
 * A real element for every part that can be operated, transparent and placed over
 * its part by the engine. Focus, screen readers and input methods take the browser's
 * own path.
 */
export default function Controls({ targets, local: u, failed, visible, t, nodes, diskPull, grip, onHint, onFocus, onBlur, onAct, onChange, onKnob }: Props) {
    const tuningDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressTuningClick = useRef(false);
    const pullDrag = useRef<{ y: number; moved: boolean } | null>(null);
    const suppressPullClick = useRef(false);
    const turned = (id: string) => id === 'scope-tune' ? u.scopeFreq : id === 'scope-wave' ? u.scopeWave : id === 'scope-rate' ? u.scopeRate :
        id === 'scope-xy' ? u.scopeAxis : id === 'meter-amplitude' ? u.meterAmplitude / (instrumentSteps(u.instrumentVariant, 'amplitude') - 1) : u.meterRate / 4;
    return <div className="station-controls" aria-label={t("密码通信终端控件")} style={{ visibility: visible ? 'visible' : 'hidden' }}>
      {targets.map(target => {
        const key = target.surface + ':' + target.id, knob = isKnob(target.id), paper = target.surface === 'paper';
        const selector = target.id === 'voice-line';
        const common = {
            ref: (el: HTMLElement | null) => { if (el)
                nodes.current.set(key, el);
            else
                nodes.current.delete(key); },
            'aria-label': target.label, 'data-control': target.id, 'data-surface': target.surface,
            role: knob || selector ? 'slider' : ['power-toggle', 'receiver-sweep', 'sound-toggle', 'music-toggle'].includes(target.id) ? 'switch' : undefined,
            'aria-valuemin': knob || selector ? 0 : undefined,
            'aria-valuemax': knob ? 100 : selector ? intercomPositions.length - 1 : undefined,
            'aria-valuenow': knob ? Math.round(turned(target.id) * 1000) / 10 : selector ? intercomPositions.indexOf(u.intercom.selector) : undefined,
            'aria-valuetext': knob || selector ? target.label : undefined,
            'aria-checked': target.id === 'power-toggle' ? u.powerOn : target.id === 'receiver-sweep' ? u.instrumentDemo : target.id === 'sound-toggle' ? u.soundOn : target.id === 'music-toggle' ? u.musicOn : undefined,
            disabled: target.disabled,
            style: failed ? { visibility: 'visible' as const } : undefined,
            title: target.label,
            'aria-expanded': target.id === 'archive-toggle' ? u.archiveOpen : target.id === 'battery-toggle' ? u.batteryOpen : undefined,
            'aria-haspopup': target.id === 'archive-toggle' ? 'dialog' as const : undefined,
            'aria-pressed': target.id === 'disk-toggle' ? u.diskOut : target.id === 'manual' ? u.manual : target.id === 'about' ? u.about :
                target.id === 'voice-talk' ? u.intercom.open : undefined,
            onMouseEnter: () => onHint(target.id),
            onMouseLeave: () => onHint(''),
            onFocus: () => onFocus(target),
            onBlur: () => onBlur(target),
        };
        if (target.href) return <a key={key} {...common} href={target.href} target="_blank" rel="noopener noreferrer">{target.label}</a>;
        if (target.id === 'disk-toggle') return <button key={key} {...common} {...diskPull} className="station-disk-grip" data-phase={u.keyDisk.phase}>
            {/* Keyed by message: a new instruction plays its short reveal again. */}
            {!target.disabled && <span key={u.keyDisk.phase === 'removed' ? 'insert' : 'pull'} className="disk-grip-hint" aria-hidden="true">{t(u.keyDisk.phase === 'removed' ? '点击插回' : '按住软盘向外拖')}</span>}
        </button>;
        if (target.id in handleSurfaces) return <button key={key} {...common} className="station-handle"
            onClick={e => { if (target.id.includes('Rear') || e.detail === 0 || failed) onAct(target.id); }}
            onPointerDown={e => grip.onPointerDown(e, target.id)}
            onPointerMove={grip.onPointerMove}
            onPointerUp={grip.onPointerUp}
            onLostPointerCapture={grip.onLostPointerCapture}
            onPointerCancel={grip.onPointerCancel}>{target.label}</button>;
        // The intercom's selector clicks round its three detents; the arrow keys stop at either end.
        if (selector) return <button key={key} {...common} onClick={() => onAct('voice-line')} onKeyDown={e => {
            const step = { ArrowRight: 'next', ArrowUp: 'next', ArrowLeft: 'prev', ArrowDown: 'prev', Home: 'off', End: 'team' }[e.key];
            if (!step) return;
            e.preventDefault();
            onAct('voice-line-' + step);
        }}>{target.label}</button>;
        // TALK latches with a click in toggle mode and talks while held in hold mode.
        if (target.id === 'voice-talk') {
            const up = () => onAct('voice-talk-up');
            return <button key={key} {...common} onClick={() => onAct('voice-talk')}
                onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); onAct('voice-talk-down'); }}
                onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
                onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) onAct('voice-talk-down'); }}
                onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') up(); }}>{target.label}</button>;
        }
        if (target.kind === 'input') return <input key={key} {...common} type="text" value={target.value || ''} maxLength={target.maxLength} placeholder={target.input?.placeholder || target.label} autoComplete={target.id === 'name' ? 'nickname' : 'off'} spellCheck={false} onChange={e => onChange(target, e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.id.startsWith('clue-')) {
                e.preventDefault();
                const i = Number(target.id.slice(5));
                nodes.current.get(`screen:clue-${Math.min(i + 1, 2)}`)?.focus();
            }
        }}/>;
        return <button key={key} {...common} onClick={e => {
                if (knob && suppressTuningClick.current && e.detail > 0) { suppressTuningClick.current = false; return; }
                if (paper && suppressPullClick.current && e.detail > 0) { suppressPullClick.current = false; return; }
                if (knob) onKnob(target.id, 1, true); else onAct(target.id);
            }} onPointerDown={knob ? e => {
                if (e.button !== 0) return;
                suppressTuningClick.current = false;
                tuningDrag.current = { x: e.clientX, y: e.clientY, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
            } : paper ? e => {
                if (e.button !== 0) return;
                suppressPullClick.current = false;
                pullDrag.current = { y: e.clientY, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
            } : undefined} onPointerMove={knob ? e => {
                const drag = tuningDrag.current;
                if (!drag) return;
                const delta = e.clientX - drag.x - (e.clientY - drag.y);
                if (Math.abs(delta) > .2) {
                    onKnob(target.id, delta / (e.shiftKey ? 1400 : 220));
                    tuningDrag.current = { x: e.clientX, y: e.clientY, moved: true };
                }
            } : paper ? e => {
                if (pullDrag.current && e.clientY - pullDrag.current.y > 16) pullDrag.current.moved = true;
            } : undefined} onPointerUp={knob ? () => {
                suppressTuningClick.current = !!tuningDrag.current?.moved;
                tuningDrag.current = null;
            } : paper ? () => {
                suppressPullClick.current = !!pullDrag.current?.moved;
                if (pullDrag.current?.moved) onAct(target.id);
                pullDrag.current = null;
            } : undefined} onPointerCancel={() => { tuningDrag.current = null; suppressTuningClick.current = false; pullDrag.current = null; suppressPullClick.current = false; }}
            onKeyDown={knob ? e => {
                if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); onKnob(target.id, e.key === 'Home' ? -40 : 40, true); }
                if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
                    e.preventDefault(); onKnob(target.id, (['ArrowDown', 'ArrowLeft'].includes(e.key) ? -1 : 1) * (e.shiftKey ? .1 : 1), true);
                }
            } : undefined} onWheel={knob ? e => {
                onKnob(target.id, Math.max(-.08, Math.min(.08, e.deltaY * (e.deltaMode ? .012 : .001))) * (e.shiftKey ? .1 : 1));
            } : undefined}>
            {target.label}
          </button>;
      })}
    </div>;
}
