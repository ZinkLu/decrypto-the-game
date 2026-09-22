import type { CSSProperties } from 'react';
import GuideContent from './GuideContent';
import type { StationState, LocalState, KeyDiskState } from './model';
import { useDiskPull } from './useDiskPull';
import { consoleHardware, hardwareMessage, roleState, diskInscription, keyDiskReadable, keyDiskIdentity, keyDiskMessage, phaseSignal, teamPalette, word } from './model';
import { translate, localizeError } from './i18n';

type Props = { state: StationState; local: LocalState; ready: boolean; status: string; inert: boolean;
    onDiskChange: (disk: KeyDiskState) => void; reducedMotion: boolean;
    onAct: (id: string) => void; onChange: (id: string, value: string) => void };

// The compact surface shares the desktop drafts, validation and actions.
export default function MobileConsole({ state: s, local: u, ready, status, onAct, onChange, onDiskChange, reducedMotion, inert }: Props) {
    const t = (key: string, values?: unknown[]) => translate(u.locale, key, values);
    const h = consoleHardware(u, s);
    const r = roleState(s, u);
    const diskReadable = keyDiskReadable(s, u);
    const handwriting = diskInscription(u.keyDisk.id);
    const ownsDisk = !!keyDiskIdentity(s);
    const diskCurrent = ownsDisk && u.keyDisk.id === keyDiskIdentity(s);
    const diskPull = useDiskPull({ disk: u.keyDisk, reduced: reducedMotion,
        enabled: diskCurrent && !inert && ['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase),
        axis: () => ({ x: 0, y: -1, pixels: 72 }), onChange: onDiskChange, onClick: () => onAct('disk-toggle') });
    const diskStyle = u.keyDisk.pull ? {
        '--disk-pull-y': `${154 - 72 * u.keyDisk.pull.amount}px`,
        '--disk-settle-y': `${154 - 72 * (u.keyDisk.pull.target ?? 0)}px`,
    } as CSSProperties : undefined;
    const signal = phaseSignal(s, u.theme);
    const lobby = s.phase === 'room', home = s.phase === 'home';
    const owner = s.ownerID === s.myPlayerID;
    const disabled = !h.online;
    const title = t(({ home: '通信局', room: '队伍准备', encrypting: '加密', intercept: '拦截', decrypt: '解码', round_result: '本轮回执', game_over: '行动结束' })[s.phase]);
    const action = home ? u.mode === 'create' ? '建立频道' : '接入频道' : lobby ? '开始行动' : s.phase === 'game_over' ? '返回通信局' : u.submitted || s.submitted ? '已发送' : '发报 · 确认';
    const battery = h.batteryPercent !== null && <span className="mobile-battery" role="img" aria-label={t('电池电量 {0}%', [h.batteryPercent])}>
        <span className="mobile-battery-cells" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <i key={i} data-filled={i < h.batteryPercent! / 25}/>)}</span>
        <span aria-hidden="true">{h.batteryPercent}%</span>
    </span>;
    if (!h.online) return <section className="mobile-console" aria-label={t('便携通信终端')} inert={inert}>
        <header>{battery}<p className="mobile-brand">DECRYPTO <span>FIELD TERMINAL / 01</span></p>
            <div className="mobile-title"><h2>{t(!h.powered ? '终端电源已关闭' : '已断开连接')}</h2></div>
            {h.powered && <p className="mobile-channel">CH 0000 · {t('离线')}</p>}</header>
        <p>{t(hardwareMessage(u, s))}</p>
        {h.powered && <>
            <section className="mobile-words"><h3>{t('我方秘密词')}</h3>
                <ol>{Array.from({ length: 4 }, (_, i) => <li key={i}><b>{i + 1}</b> {t('离线')}</li>)}</ol></section>
            <p>{t('连接恢复后，词窗与房间码将重新显示。')}</p>
            <p>{t('输入已保留，不会自动提交。')}</p>
            {!home && <button data-mobile-archive onClick={() => onAct('archive-toggle')}>{t('密报记录')}</button>}
        </>}
    </section>;
    if (u.manual || u.about) return <section className="mobile-console" aria-label={t(u.about ? '原版桌游' : '玩法')} inert={inert}>
        <button onClick={() => onAct('screen-close')}>{t('返回操作')}</button>
        <GuideContent locale={u.locale} about={u.about}/>
        {u.about && <button onClick={() => onAct('manual')}>{t('一图读懂玩法')}</button>}
    </section>;
    return <section className="mobile-console" aria-label={t('便携通信终端')} inert={inert}>
        <header>{battery}<p className="mobile-brand">DECRYPTO <span>FIELD TERMINAL / 01</span></p>
            <div className="mobile-title"><h2 style={signal.actingTeam ? { color: teamPalette(signal.actingTeam, s.myTeam, u.theme).ink } : undefined}>{title}</h2>{s.deadline > 0 && <span className="mobile-clock">{u.seconds}s</span>}</div>
            <p className="mobile-channel">{s.roomCode ? `CH ${s.roomCode}` : t('双队通信  /  4–8 人')} · {s.recovering ? t('正在恢复原座位…') : s.connected ? t('已连接') : t('连接中')}
                {s.myTeam && ` · ${t('{0} 队', [s.myTeam])}`}</p>
        </header>
        {home && <>
            <div className="mobile-tabs"><button aria-pressed={u.mode === 'create'} onClick={() => onAct('mode-create')}>{t('建立频道')}</button><button aria-pressed={u.mode === 'join'} onClick={() => onAct('mode-join')}>{t('接入频道')}</button></div>
            <label>{t('呼号')}<input autoComplete="nickname" value={u.name} maxLength={20} onChange={e => onChange('name', e.target.value)}/></label>
            {u.mode === 'join' && <label>{t('四位频道编号')}<input inputMode="numeric" autoComplete="off" value={u.code} maxLength={4} placeholder="1234" onChange={e => onChange('code', e.target.value)}/></label>}
            <p>{t('每队至少两人，可以由 AI 补位。')}</p>
        </>}
        {lobby && <>
            <button onClick={() => onAct('copy-code')}>{t('复制频道编号')}</button>
            <p>{t('每队至少两人，可以由 AI 补位。')}</p>
            {(['A', 'B'] as const).map(team => {
                const players = team === 'A' ? s.teamA : s.teamB;
                const own = players.some(p => p.id === s.myPlayerID);
                return <section className="mobile-roster" key={team}>
                    <h3 style={{ color: teamPalette(team, s.myTeam, u.theme).ink }}>{t('{0} 队 · {1} 人', [team, players.length])}</h3>
                    <ul>{players.map((p, i) => <li key={p.id}><span>{p.nickname}{p.is_ai ? ' · AI' : ''}{p.id === s.myPlayerID ? t(' · 你') : ''}{p.id === s.ownerID ? t(' · 房主') : ''}{p.disconnected ? ` · ${t('离线 · 等待重连')}` : ''}</span>{owner && p.is_ai && <button disabled={disabled} onClick={() => onAct(`remove-${team}-${i}`)} aria-label={t('移除 {0}', [p.nickname])}>{t('移除')}</button>}</li>)}</ul>
                    <div className="mobile-tabs"><button disabled={disabled || (!own && players.length >= 4)} onClick={() => onAct(`team-${team}`)}>{t(own ? '离开队伍' : '加入 {0} 队', [team])}</button>{owner && <button disabled={disabled || players.length >= 4} onClick={() => onAct(`ai-${team}`)}>{t('增加 AI')}</button>}</div>
                </section>;
            })}
            {!owner && <p>{t('等待房主开始行动')}</p>}
        </>}
        {!home && !lobby && <>
            <div className="mobile-round"><strong>{t('第 {0} / 16 回合', [s.round])}</strong><button data-mobile-archive onClick={() => onAct('archive-toggle')}>{t('密报记录')}</button></div>
            <div className="mobile-scores">{(['A', 'B'] as const).map(team => {
                const score = team === 'A' ? s.scoreA : s.scoreB;
                return <p key={team}><strong style={{ color: teamPalette(team, s.myTeam, u.theme).ink }}>{t('{0} 队', [team])}</strong>
                    <span style={{ color: '#2e6949' }}>{t('截获')} {score.interceptions} / 2</span>
                    <span style={{ color: '#a44235' }}>{t('失误')} {score.decrypt_failures} / 2</span></p>;
            })}</div>
            {!!s.myWords.length && <section className="mobile-words"><div><h3>{t('我方秘密词')}</h3><button onClick={() => onAct('words')}>{t(u.hiddenWords ? '显示' : '遮住')}</button></div><ol>{s.myWords.map((v, i) => <li key={i}><b>{i + 1}</b> {u.hiddenWords ? '••••' : word(v, u.locale)}</li>)}</ol></section>}
            {s.phase === 'game_over' ? <h3 className="mobile-result">{s.gameOver?.winner ? t('{0} 队获胜', [s.gameOver.winner]) : t('双方平局')}</h3> : <p>{t('本轮加密者：{0}', [s.encryptor])}</p>}
            {ownsDisk && <section className="mobile-key-disk" data-phase={diskCurrent ? u.keyDisk.phase : 'queued'} aria-label={t('本轮密钥软盘')}>
                <div className="mobile-disk-mechanism" style={diskStyle}>
                    <button className="mobile-disk-grip" {...diskPull} disabled={!diskCurrent || !u.powerOn || !['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase)}
                        aria-label={t(u.keyDisk.phase === 'ejected' ? '按住露出的软盘继续拖出，或点击插回' : u.diskOut ? '插入软盘，或按住向内推回' : '按住向外拖出软盘，或点击弹出')}/>
                    <div className="mobile-floppy" aria-hidden="true"><span><b style={{ color: handwriting.ink, fontSize: handwriting.text.length > 11 ? '11px' : undefined, transform: `rotate(${handwriting.tilt}rad) translate(${handwriting.x / 3}px, ${handwriting.y / 3}px)` }}>{handwriting.text}</b><small>KEY / {String(s.round).padStart(2, '0')}</small></span><i/></div>
                    <div className="mobile-drive" aria-hidden="true"><span>KEY DRIVE</span><i/></div>
                </div>
                <p className="mobile-disk-hint">{t(u.keyDisk.phase === 'removed' ? '点击插回' : '按住软盘向上拖出')}</p>
                <div className="mobile-disk-status"><p role="status">{t(keyDiskMessage(u.keyDisk))}</p>
                    <button disabled={!diskCurrent || !['ready', 'reading', 'ejected', 'removed'].includes(u.keyDisk.phase)}
                        onClick={() => onAct(u.diskOut ? 'disk-toggle' : 'disk-eject')}>{t(u.diskOut ? '插入软盘' : '弹出软盘')}</button></div>
                {diskReadable ? <p className="mobile-private-code">{t('本轮私密密码：{0}', [s.secretDigits.join(' · ')])}</p> :
                    <p className="mobile-private-code">— · — · —</p>}
            </section>}
            {r.encrypt && <>
                {u.clues.map((value, i) => <label key={i}>{t('线索 {0}', [i + 1])}
                    <span className="mobile-clue-target">{diskReadable ? `${s.secretDigits[i]} · ${word(s.myWords[s.secretDigits[i] - 1] || s.secretWords[i], u.locale)}` : t('已隐藏')}</span><input value={value} maxLength={80} disabled={!r.active || disabled} onChange={e => onChange(`clue-${i}`, e.target.value)}/></label>)}
            </>}
            {!r.encrypt && s.clues.length > 0 && <ol className="mobile-clues">{s.clues.map((v, i) => <li key={i}>{v}</li>)}</ol>}
            {r.guess && <>
                <div className="mobile-digits">{u.guess.map((n, i) => <button key={i} aria-label={t('密码第 {0} 位', [i + 1])} aria-pressed={u.slot === i} disabled={!r.active || disabled} onClick={() => onAct(`slot-${i}`)}>{n || '—'}</button>)}</div>
                <div className="mobile-keypad">{[1, 2, 3, 4].map(n => <button key={n} disabled={!r.active || disabled} onClick={() => onAct(`key-${n - 1}`)}>{n}</button>)}<button disabled={!r.active || disabled} onClick={() => onAct('key-4')}>{t('退格')}</button></div>
            </>}
            {!r.active && !['round_result', 'game_over'].includes(s.phase) && <p role="status">{s.aiStatus && ['thinking', 'retrying'].includes(s.aiStatus.state || '') ? t('AI 正在推理第 {0} 条 · 已完成 {1}/3', [s.aiStatus.step, s.aiStatus.completed || 0]) : t('链路已接通 · 等待信号')}</p>}
            {s.roundResult && <p>{s.roundResult.intercept_success !== undefined && t(s.roundResult.intercept_success ? '拦截成功' : '拦截失败')} · {s.roundResult.decrypt_success !== undefined && t(s.roundResult.decrypt_success ? '解码成功' : '解码失败')}</p>}
        </>}
        <p className="mobile-status" role={s.error ? 'alert' : 'status'}>{s.error ? localizeError(u.locale, s.error) : status}</p>
        <div className="mobile-audio" role="group" aria-label={t('声音')}>
            <button role="switch" aria-checked={u.soundOn} onClick={() => onAct('sound-toggle')}>{t(u.soundOn ? '关闭音效' : '开启音效')}</button>
            <button role="switch" aria-checked={u.musicOn} onClick={() => onAct('music-toggle')}>{t(u.musicOn ? '关闭背景音乐' : '开启背景音乐')}</button>
        </div>
        <nav className="mobile-tabs"><button onClick={() => onAct('manual')}>{t('一图读懂玩法')}</button><button onClick={() => onAct('about')}>{t('原版桌游与购买')}</button></nav>
        <footer><button className="mobile-action" disabled={!ready || disabled} onClick={() => onAct('transmit')}><span>ACTION</span>{t(action)}</button></footer>
    </section>;
}
