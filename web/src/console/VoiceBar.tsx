import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { currentView, inputLevel, hold, setMic, setMode, setVolume, toggleVoiceChannel, startVoice, stopVoice, useVoice } from '../services/voice';
import { apart, speakingTo, voiceStatus } from './voice';
import StationToast, { type Translate } from './StationToast';
import './voice-bar.css';

type VoiceNotice = { id: number; message: string; listenOnly: string };

/** Whether this room has voice: the server offers it and the page is seated. */
function useAvailable() {
    return useGameStore(s => !!s.voice && !!s.roomCode);
}

/** Keep route labels in sync without publishing continuously sampled input levels. */
function useRoomVoice() {
    const available = useAvailable();
    useGameStore(s => s.phase);
    useGameStore(s => s.myRole);
    useGameStore(s => s.myPlayerID);
    useGameStore(s => s.encryptorID);
    useGameStore(s => s.teamA);
    useGameStore(s => s.teamB);
    const v = useVoice();
    const view = currentView();
    const line = v.status === 'starting' ? '正在接通语音…' : v.status === 'reconnecting' ? '语音中断，正在重连…' :
        !v.machine ? '终端脱机，对讲暂停' : voiceStatus(view, v.whisper);
    return { available, v, view, line };
}

/** Transient voice feedback stays with the other notices, outside the header. */
export function VoiceNotices({ t }: { t: Translate }) {
    const { available, v, line } = useRoomVoice();
    const [toast, setToast] = useState<VoiceNotice | null>(null);
    const serial = useRef(0);
    const previous = useRef({ available: false, status: 'off', line: '', notice: '', listenOnly: '' });
    useEffect(() => {
        const before = previous.current;
        previous.current = { available, status: v.status, line, notice: v.notice, listenOnly: v.listenOnly };
        if (!available) { setToast(null); return; }
        const newNotice = v.notice !== before.notice && !!v.notice;
        if (v.status === 'off') {
            if (v.notice && (newNotice || !before.available || before.status !== 'off'))
                setToast({ id: ++serial.current, message: v.notice, listenOnly: v.listenOnly });
            else if (before.status !== 'off') setToast(null);
            return;
        }
        if (!before.available || v.status !== before.status || line !== before.line || v.listenOnly !== before.listenOnly || newNotice)
            setToast({ id: ++serial.current, message: newNotice ? v.notice : line, listenOnly: v.listenOnly });
    }, [available, v.status, line, v.notice, v.listenOnly]);
    if (!available || !toast) return null;
    return <StationToast key={toast.id} message={`${t(toast.message)}${toast.listenOnly ? ` · ${t(toast.listenOnly)}` : ''}`}
        t={t} onClose={() => setToast(null)}/>;
}

/** This tiny meter updates itself, without repainting the machine or the toolbar. */
function InputLevel({ active, t }: { active: boolean; t: Translate }) {
    const meter = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const update = () => {
            const level = active && !document.hidden ? inputLevel() : 0;
            meter.current?.style.setProperty('--input-level', String(level));
            meter.current?.setAttribute('aria-valuenow', String(Math.round(level * 100)));
        };
        update();
        if (!active) return;
        const timer = window.setInterval(update, 120);
        document.addEventListener('visibilitychange', update);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
    }, [active]);
    return <span ref={meter} className="station-voice-level" role="meter" aria-label={t('输入电平')}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><span/></span>;
}

function MicIcon() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>
    </svg>;
}

/** Voice is a normal set of page controls at the top left. */
export default function VoiceBar({ t }: { t: Translate }) {
    const { available, v, view, line } = useRoomVoice();
    if (!available) return null;
    const split = apart(view);
    const route = speakingTo(view, v.whisper);
    const muted = !v.machine || !!v.listenOnly || route === null;
    const ready = v.status === 'on';
    const channelLabel = !ready ? v.status === 'starting' ? '正在接通语音…' : '语音中断，正在重连…' :
        muted ? v.listenOnly ? '仅收听' : '静音' : route === 'team' ? '本队通话' : '全桌通话';
    const end = () => hold(false);
    if (v.status === 'off') return <div className="station-voice">
        <button type="button" className="station-voice-join" onClick={() => void startVoice()}><MicIcon/>{t('加入语音')}</button>
    </div>;
    return <div className="station-voice" role="group" aria-label={t('语音')}>
      <span className="sr-only" role="status">{t(line)}{v.listenOnly && ` · ${t('仅收听')}`}</span>
      <div className="station-voice-input">
      {v.mode === 'toggle'
        ? <button type="button" role="switch" aria-checked={v.micOn && !muted} disabled={!ready || muted}
            aria-label={`${t(v.micOn && !muted ? '开麦' : '闭麦')} · ${t('快捷键 ` 开关麦克风')}`} aria-keyshortcuts="`" onClick={() => setMic(!v.micOn)}>
            <MicIcon/>{t(v.micOn && !muted ? '开麦' : '闭麦')}</button>
        : <button type="button" aria-pressed={v.holding && !muted} disabled={!ready || muted} aria-label={`${t('按住说话')} · ${t('按住 ` 说话')}`} aria-keyshortcuts="`"
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); hold(true); }}
            onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
            onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && !event.altKey &&
                !event.repeat && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); hold(true); } }}
            onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') end(); }}><MicIcon/>{t('按住说话')}</button>}
      <InputLevel active={ready && !muted && (v.mode === 'hold' ? v.holding : v.micOn)} t={t}/>
      </div>
      <button type="button" className="station-voice-channel" aria-keyshortcuts="V"
          aria-label={`${t(channelLabel)} · ${t('切换全桌／队内语音')}`}
          disabled={split || !view.team || !v.machine || !!v.listenOnly || !ready}
          onClick={() => toggleVoiceChannel()}>
        <span>{t(channelLabel)}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 5h10m-3-3 3 3-3 3M13 11H3m3-3-3 3 3 3"/>
        </svg>
      </button>
      <button type="button" className="station-voice-leave" onClick={stopVoice}>{t('退出语音')}</button>
    </div>;
}

/** How this page talks, among the settings. */
export function VoiceSettings({ t }: { t: Translate }) {
    const available = useAvailable();
    const { mode, volume } = useVoice();
    if (!available) return null;
    return <fieldset className="station-music station-voice-settings"><legend>{t('语音')}</legend>
      <div className="station-voice-mode">
        <span>{t('说话方式')}</span>
        <span className="station-voice-modes" role="group" aria-label={t('说话方式')}>
          <button type="button" aria-pressed={mode === 'toggle'} onClick={() => setMode('toggle')}>{t('切换开麦')}</button>
          <button type="button" aria-pressed={mode === 'hold'} onClick={() => setMode('hold')}>{t('按住说话')}</button>
        </span>
      </div>
      <label className="station-music-volume"><span>{t('语音音量')}</span>
        <input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)} aria-valuetext={`${Math.round(volume * 100)}%`}
          onChange={event => setVolume(Number(event.target.value) / 100)}/>
        <output>{Math.round(volume * 100)}%</output>
      </label>
      <p>{t(mode === 'hold' ? '按住 ` 说话' : '快捷键 ` 开关麦克风')}{' · '}{t('猜测时两队分开讨论，揭晓后回到全桌。')}</p>
    </fieldset>;
}
