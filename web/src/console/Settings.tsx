import type { Locale } from './i18n';
import { themeChoices, type ThemeId } from './model';
import type { MusicPreferences, MusicStatus } from './music';
import { qualityChoices, qualityProfiles, describeQuality, type QualityChoice, type QualityLevel } from './quality';
import VoiceBar, { VoiceSettings } from './VoiceBar';
import ShortcutHelp from './ShortcutHelp';

export const qualityLabels: Record<QualityChoice, string> = { auto: '自动', high: '高', medium: '中', low: '低' };

type Translate = (message: string, values?: unknown[]) => string;

/** What a quality choice switches, for the notice shown when it is selected. */
export function qualityHint(choice: QualityChoice, level: QualityLevel, t: Translate) {
    return choice === 'auto'
        ? `${t('按本机实测的单帧耗时选择档位；再次点击重新检测')} · ${t('当前')} ${t(qualityLabels[level])}`
        : `${t(qualityLabels[choice])} · ${describeQuality(qualityProfiles[choice], t)}`;
}

interface Props {
    t: Translate;
    inspection: boolean;
    /** The 3D machine could not start: its quality cannot be chosen. */
    failed: boolean;
    inert: boolean;
    quality: QualityChoice;
    level: QualityLevel;
    theme: ThemeId;
    locale: Locale;
    soundOn: boolean;
    music: MusicPreferences;
    musicStatus: MusicStatus;
    powered: boolean;
    onQuality: (choice: QualityChoice) => void;
    onTour: () => void;
    onTheme: (theme: ThemeId, label: string) => void;
    onLocale: (locale: Locale) => void;
    onAct: (id: string) => void;
    onVolume: (volume: number) => void;
    onRetryMusic: () => void;
}

/** Settings of this visit, beside the machine: they are the page's, not modelled hardware. */
export default function Settings({ t, inspection, failed, inert, quality, level, theme, locale, soundOn, music, musicStatus, powered,
    onQuality, onTour, onTheme, onLocale, onAct, onVolume, onRetryMusic }: Props) {
    return <div className="station-settings" inert={inert}>
      <div className="station-session-tools">
      <nav className="station-navigation" aria-label={t('页面导航')}>
        <a href="/" aria-current={!inspection ? 'page' : undefined}>{t('游戏')}</a>
        <a href="/preview" aria-current={inspection ? 'page' : undefined}>Preview</a>
        <ShortcutHelp t={t}/>
        {!inspection && <button type="button" className="station-tour-replay" data-tour-replay onClick={onTour}>{t('操作提示')}</button>}
      </nav>
      <VoiceBar t={t}/>
      </div>
      <details name="station-panel" id="station-preferences" className="station-preferences"><summary>{t('设置')}</summary><div className="station-preferences-panel">
      {!failed && <div className="station-quality" role="group" aria-label={t("画质")}>
        <span aria-hidden="true">{t("画质")}</span>
        {qualityChoices.map(choice => <button key={choice} aria-pressed={quality === choice}
            onClick={() => onQuality(choice)}>
          {t(qualityLabels[choice])}{choice === 'auto' && quality === 'auto' && <small>{t(qualityLabels[level])}</small>}
        </button>)}
      </div>}
      <fieldset className="station-themes"><legend>{t('主题')}</legend>
        <div className="station-theme-options">
          {themeChoices.map(choice => <button key={choice.id} type="button" aria-pressed={theme === choice.id}
            onClick={event => {
              onTheme(choice.id, choice.label);
              // Reveal the physical exchange instead of covering it with Settings.
              const settings = event.currentTarget.closest('details');
              if (settings) { settings.open = false; settings.querySelector('summary')?.focus({ preventScroll: true }); }
            }}>
            <span className="station-theme-swatches" aria-hidden="true"><i style={{ background: choice.own.plate }}/><i style={{ background: choice.opponent.plate }}/><i style={{ background: choice.led.word }}/><i style={{ background: choice.led.legend }}/></span>
            {t(choice.label)}
          </button>)}
        </div>
      </fieldset>
      <fieldset className="station-music"><legend>{t('声音')}</legend>
        <div className="station-music-row">
          <span>{t('音效')}</span>
          <button type="button" role="switch" aria-checked={soundOn} aria-label={t('音效')}
            onClick={() => onAct('sound-toggle')}>{t(soundOn ? '已开启' : '已关闭')}</button>
        </div>
        <div className="station-music-row">
          <span>{t('背景音乐')}</span>
          <button type="button" role="switch" aria-checked={music.enabled} aria-label={t('背景音乐')}
            onClick={() => onAct('music-toggle')}>{t(music.enabled ? '已开启' : '已关闭')}</button>
        </div>
        <label className="station-music-volume"><span>{t('音乐音量')}</span>
          <input type="range" min="0" max="100" step="1" value={Math.round(music.volume * 100)}
            aria-valuetext={`${Math.round(music.volume * 100)}%`}
            onChange={event => onVolume(Number(event.target.value) / 100)}/>
          <output>{Math.round(music.volume * 100)}%</output>
        </label>
        <p role="status">{!powered ? t('终端关机，音乐已暂停。') : !music.enabled ? t('开启后随大厅、对局与结局播放。') :
            musicStatus === 'error' ? t('音乐未能载入，可重试；游戏不受影响。') : musicStatus === 'loading' ? t('正在载入音乐…') :
            musicStatus === 'playing' ? t('正在播放背景音乐') : t('音乐已就绪，结算后保持安静。')}</p>
        {musicStatus === 'error' && <button type="button" onClick={onRetryMusic}>{t('重试音乐')}</button>}
        <a href="/audio/CREDITS.md" target="_blank" rel="noreferrer">{t('音乐与音效来源')}</a>
      </fieldset>
      <VoiceSettings t={t}/>
      <div className="station-language" role="group" aria-label="Language / 语言">
        <button lang="zh-CN" aria-pressed={locale === 'zh'} onClick={() => onLocale('zh')}>中文</button>
        <button lang="en" aria-pressed={locale === 'en'} onClick={() => onLocale('en')}>EN</button>
      </div>
      </div></details>
    </div>;
}
