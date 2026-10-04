import type { ReactNode } from 'react';
import './shortcuts.css';

type Translate = (message: string, values?: unknown[]) => string;

function Shortcut({ keys, children }: { keys: ReactNode; children: ReactNode }) {
    return <div className="station-shortcut-row"><dt>{keys}</dt><dd>{children}</dd></div>;
}

/** A keyboard reference beside the page settings, available before joining a room. */
export default function ShortcutHelp({ t }: { t: Translate }) {
    return <details name="station-panel" id="station-shortcuts" className="station-shortcuts">
      <summary aria-keyshortcuts="Shift+/">{t('快捷键')} <kbd aria-hidden="true">?</kbd></summary>
      <div className="station-shortcuts-panel" role="region" aria-labelledby="station-shortcuts-title">
        <header>
          <h2 id="station-shortcuts-title">{t('快捷键')}</h2>
          <button type="button" onClick={event => {
              const details = event.currentTarget.closest('details');
              if (details) { details.open = false; details.querySelector('summary')?.focus({ preventScroll: true }); }
          }}>{t('关闭快捷键')}</button>
        </header>
        <section aria-labelledby="station-shortcuts-input">
          <h3 id="station-shortcuts-input">{t('输入与提交')}</h3>
          <dl>
            <Shortcut keys={<><kbd>1</kbd>–<kbd>4</kbd></>}>{t('选择解码或拦截的编号')}</Shortcut>
            <Shortcut keys={<kbd>Backspace</kbd>}>{t('清除当前编号；空位时退回上一位')}</Shortcut>
            <Shortcut keys={<kbd>Enter</kbd>}>{t('执行 ACTION')}<small>{t('线索框内移到下一条，最后一条移到 ACTION。')}</small></Shortcut>
            <Shortcut keys={<><kbd>Ctrl</kbd><span>/</span><kbd>⌘</kbd><span>+</span><kbd>Enter</kbd></>}>
              {t('执行 ACTION')}<small>{t('在线索、代号和频道编号输入框中也可使用。')}</small>
            </Shortcut>
          </dl>
        </section>
        <section aria-labelledby="station-shortcuts-records">
          <h3 id="station-shortcuts-records">{t('记录与玩法')}</h3>
          <dl>
            <Shortcut keys={<kbd>H</kbd>}>{t('打开或收起密报记录')}<small>{t('查看已公开的线索、密码、猜测和结果；记录板可写私人笔记。')}</small></Shortcut>
            <Shortcut keys={<kbd>G</kbd>}>{t('打开或收起玩法')}</Shortcut>
            <Shortcut keys={<><kbd>←</kbd><kbd>→</kbd><span>/</span><kbd>1</kbd>–<kbd>4</kbd></>}>{t('桌面玩法手册内翻页')}</Shortcut>
          </dl>
        </section>
        <section aria-labelledby="station-shortcuts-voice">
          <h3 id="station-shortcuts-voice">{t('语音')}</h3>
          <dl>
            <Shortcut keys={<kbd>`</kbd>}>{t('切换开麦或按住说话')}<small>{t('先加入语音，再在设置中选择说话方式。')}</small></Shortcut>
            <Shortcut keys={<kbd>V</kbd>}>{t('切换全桌／队内语音')}<small>{t('先接通语音并加入队伍；猜测阶段固定为队内。')}</small></Shortcut>
          </dl>
        </section>
        <section aria-labelledby="station-shortcuts-navigation">
          <h3 id="station-shortcuts-navigation">{t('页面操作')}</h3>
          <dl>
            <Shortcut keys={<><kbd>Tab</kbd><span>/</span><kbd>Shift</kbd><span>+</span><kbd>Tab</kbd></>}>{t('移到下一或上一控件')}</Shortcut>
            <Shortcut keys={<kbd>?</kbd>}>{t('打开或收起快捷键')}</Shortcut>
            <Shortcut keys={<kbd>Esc</kbd>}>{t('关闭当前面板')}</Shortcut>
          </dl>
        </section>
        <p className="station-shortcuts-note">{t('输入文字时，普通快捷键暂停；焦点在按钮上时，Enter 操作该按钮。')}</p>
      </div>
    </details>;
}
