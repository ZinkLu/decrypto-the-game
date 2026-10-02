import { useGameStore } from '../store/gameStore';
import { currentView, hold, setMic, setMode, setVolume, setWhisper, startVoice, stopVoice, useVoice } from '../services/voice';
import { apart, voiceStatus } from './voice';

type Translate = (message: string, values?: unknown[]) => string;

/** Whether this room has voice: the server offers it and the page is seated. */
function useAvailable() {
    return useGameStore(s => !!s.voice && !!s.roomCode);
}

/** The voice of the room, beside the settings: like them, the page's, not modelled hardware. */
export default function VoiceBar({ t }: { t: Translate }) {
    const available = useAvailable();
    const players = useGameStore(s => s.players);
    const me = useGameStore(s => s.myPlayerID);
    // The line under the controls follows the game.
    useGameStore(s => s.phase);
    useGameStore(s => s.myRole);
    useGameStore(s => s.encryptorID);
    useGameStore(s => s.teamA);
    useGameStore(s => s.teamB);
    const v = useVoice();
    if (!available) return null;
    if (v.status === 'off')
        return <div className="station-voice"><button type="button" onClick={() => void startVoice()}>{t('加入语音')}</button></div>;
    const view = currentView();
    const split = apart(view);
    const line = v.status === 'starting' ? '正在接通语音…' : v.status === 'reconnecting' ? '语音中断，正在重连…' :
        !v.machine ? '终端脱机，对讲暂停' : voiceStatus(view, v.whisper);
    const names = new Map(players.map(p => [p.id, p.nickname]));
    const talking = v.speaking.includes(me) || undefined;
    const end = () => hold(false);
    return <div className="station-voice" role="group" aria-label={t('语音')} data-apart={split || undefined}>
      {v.mode === 'toggle'
        ? <button type="button" role="switch" aria-checked={v.micOn && !v.listenOnly} disabled={!!v.listenOnly} data-talking={talking}
            title={t('快捷键 ` 开关麦克风')} onClick={() => setMic(!v.micOn)}>{t(v.micOn ? '开麦' : '闭麦')}</button>
        : <button type="button" aria-pressed={v.holding} disabled={!!v.listenOnly} data-talking={talking} title={t('按住 ` 说话')}
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); hold(true); }}
            onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
            onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); hold(true); } }}
            onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') end(); }}>{t('按住说话')}</button>}
      <button type="button" role="switch" aria-checked={v.whisper && !split && !!view.team} disabled={split || !view.team}
          title={t('只说给队友听')} onClick={() => setWhisper(!v.whisper)}>{t('悄悄话')}</button>
      <span className="station-voice-status" role="status">
        {t(v.notice || line)}{v.listenOnly && ` · ${t(v.listenOnly)}`}
      </span>
      {v.heard.length > 0 && <ul className="station-voice-people" aria-label={t('通话中')}>
        {v.heard.map(id => <li key={id} data-speaking={v.speaking.includes(id) || undefined}>{names.get(id) ?? '?'}</li>)}
      </ul>}
      <button type="button" onClick={stopVoice}>{t('退出语音')}</button>
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
