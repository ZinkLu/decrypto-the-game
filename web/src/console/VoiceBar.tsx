import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { currentView, hold, setMic, setMode, setVolume, toggleVoiceChannel, startVoice, stopVoice, useVoice } from '../services/voice';
import { apart, speakingTo, voiceStatus } from './voice';
import StationToast, { type Translate } from './StationToast';

type VoiceNotice = { id: number; message: string; listenOnly: string };

/** Whether this room has voice: the server offers it and the page is seated. */
function useAvailable() {
    return useGameStore(s => !!s.voice && !!s.roomCode);
}

/** Compact room voice controls and its transient notices, in the page's notice rail. */
export default function VoiceBar({ t }: { t: Translate }) {
    const available = useAvailable();
    const players = useGameStore(s => s.players);
    const me = useGameStore(s => s.myPlayerID);
    // Channel labels follow the game; voice activity does not generate notices.
    useGameStore(s => s.phase);
    useGameStore(s => s.myRole);
    useGameStore(s => s.encryptorID);
    useGameStore(s => s.teamA);
    useGameStore(s => s.teamB);
    const v = useVoice();
    const view = currentView();
    const split = apart(view);
    const line = v.status === 'starting' ? '正在接通语音…' : v.status === 'reconnecting' ? '语音中断，正在重连…' :
        !v.machine ? '终端脱机，对讲暂停' : voiceStatus(view, v.whisper);
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
    if (!available) return null;
    const route = speakingTo(view, v.whisper);
    const label = v.status !== 'on' || !v.machine ? line : route === 'table' ? '全桌通话' : route === 'team' ? '本队' : '静音';
    const names = new Map(players.map(p => [p.id, p.nickname]));
    const talking = v.speaking.includes(me) || undefined;
    const end = () => hold(false);
    return <>
      {toast && <StationToast key={toast.id} message={`${t(toast.message)}${toast.listenOnly ? ` · ${t(toast.listenOnly)}` : ''}`}
          t={t} onClose={() => setToast(null)} />}
      {v.status === 'off'
        ? <button type="button" className="station-voice station-voice-join" onClick={() => void startVoice()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>
            </svg><span>{t('加入语音')}</span>
          </button>
        : <div className="station-voice" role="group" aria-label={t('语音')} data-apart={split || undefined}>
      <span className="station-voice-status">{t(label)}{v.listenOnly && ` · ${t('仅收听')}`}</span>
      <div className="station-voice-actions">
      {v.mode === 'toggle'
        ? <button type="button" role="switch" aria-checked={v.micOn && !v.listenOnly} disabled={!!v.listenOnly} data-talking={talking}
            aria-label={`${t(v.micOn && !v.listenOnly ? '开麦' : '闭麦')} · ${t('快捷键 ` 开关麦克风')}`} aria-keyshortcuts="`" onClick={() => setMic(!v.micOn)}>{t(v.micOn && !v.listenOnly ? '开麦' : '闭麦')}</button>
        : <button type="button" aria-pressed={v.holding} disabled={!!v.listenOnly} data-talking={talking} aria-label={`${t('按住说话')} · ${t('按住 ` 说话')}`} aria-keyshortcuts="`"
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); hold(true); }}
            onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
            onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && !event.altKey &&
                !event.repeat && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); hold(true); } }}
            onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') end(); }}>{t('按住说话')}</button>}
      <button type="button" role="switch" aria-checked={v.whisper && !split && !!view.team} disabled={split || !view.team || !v.machine || !!v.listenOnly || v.status !== 'on'}
          aria-keyshortcuts="V" aria-label={`${t('悄悄话')} · ${t('切换全桌／队内语音')}`} onClick={() => toggleVoiceChannel()}>{t('悄悄话')}</button>
      <button type="button" className="station-voice-leave" onClick={stopVoice}>{t('退出语音')}</button>
      </div>
      {v.heard.length > 0 && <ul className="station-voice-people" aria-label={t('通话中')}>
        {v.heard.map(id => <li key={id} data-speaking={v.speaking.includes(id) || undefined}>{names.get(id) ?? '?'}</li>)}
      </ul>}
      </div>}
    </>;
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
