import { useEffect, useRef, type CSSProperties } from 'react';
import GuideContent from './GuideContent';
import type { StationState, LocalState, KeyDiskState, Action } from './model';
import { useDiskPull } from './useDiskPull';
import { consoleHardware, hardwareMessage, roleState, diskInscription, keyDiskDurations, keyDiskReadable, keyDiskIdentity, keyDiskMessage, phaseSignal, phaseTitle, teamPalette, word, isBeat, roundCast, transmission, teammateChoices, teammateStatus, seatDuty, deadlineWarning, timeoutNotice, resultView, resultSummary, handoverLine, gameOverView } from './model';
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
    const diskStyle = {
        '--disk-arrive-duration': `${keyDiskDurations.arriving}ms`,
        '--disk-insert-duration': `${keyDiskDurations.inserting}ms`,
        ...u.keyDisk.pull ? {
        '--disk-pull-y': `${154 - 72 * u.keyDisk.pull.amount}px`,
        '--disk-settle-y': `${154 - 72 * (u.keyDisk.pull.target ?? 0)}px`,
        } : {},
    } as CSSProperties;
    const signal = phaseSignal(s, u.theme);
    const cast = roundCast(s);
    // The same round context and live slots as the CRT, without its briefing page.
    const context = !isBeat(s.phase) ? '' : [
        ...s.phase === 'encrypting' ? [cast.sending && t('{0} 队发报', [cast.sending])] :
            [cast.sending && t('{0} 队解码', [cast.sending]), cast.intercepted && cast.receiving ? t('{0} 队拦截', [cast.receiving]) : ''],
        s.encryptor && t('加密者 {0}', [s.myRole === 'encryptor' ? t('你') : s.encryptor]),
    ].filter(Boolean).join(' · ');
    // A seat that only watches follows every action on the air: both teams while they guess.
    const watchedActions: Action[] = !isBeat(s.phase) || r.encrypt || r.guess || u.submitted || s.submitted ? [] :
        s.phase === 'encrypting' ? ['encrypt'] : cast.intercepted ? ['intercept', 'decrypt'] : ['decrypt'];
    const readable = keyDiskReadable(s, u) && s.myRole === 'encryptor';
    const watching = watchedActions.map(action => ({ action, team: action === 'intercept' ? cast.receiving : cast.sending, tx: transmission(s, readable, action)! }));
    const watchStatus = watching.map(({ action, team, tx }) => {
        const crew = team ? t('{0} 队', [team]) : t('对手');
        const who = tx.player || crew;
        const working = tx.slots.findIndex(slot => slot.active);
        if (action === 'encrypt') return !tx.started ? t('链路已接通 · 等待 {0} 开始', [s.encryptor || t('加密者')]) :
            tx.ai && working >= 0 ? t(tx.retrying ? '{0} 正在重试第 {1} 条' : '{0} 正在推理第 {1} 条', [who, working + 1]) : t('{0} · 已写好 {1} / 3', [who, tx.count]);
        return tx.submitted ? t('{0} 已提交', [crew]) : !tx.started ? t('{0} 尚未开始', [crew]) :
            tx.ai && working >= 0 ? t(tx.retrying ? '{0} 正在重试第 {1} 条' : '{0} 正在推理第 {1} 条', [who, working + 1]) : t('{0} · 已选 {1} / 3', [who, tx.count]);
    }).join(' · ');
    const lobby = s.phase === 'room', home = s.phase === 'home';
    const owner = s.ownerID === s.myPlayerID;
    const disabled = !h.online;
    const title = t(phaseTitle(s));
    const acting = (r.encrypt || r.guess) && r.active;
    const beat = isBeat(s.phase);
    const submitted = beat && (u.submitted || s.submitted);
    const peers = submitted ? [] : teammateChoices(s);
    const accepted = s.playerProgress[r.action];
    const shownGuess = s.submitted && accepted?.state === 'submitted' && accepted.guesses?.length === 3 ? accepted.guesses : u.guess;
    const workingArea = beat && (r.encrypt || r.guess);
    const action = home ? u.mode === 'create' ? '建立频道' : '加入频道' : lobby ? '开始行动' : s.phase === 'game_over' ? '回到房间' :
        s.submitted ? '已提交' : u.submitted ? '正在发送…' : acting ? '发报 · 确认' : '等待中';
    const duty = seatDuty(s), handover = handoverLine(s), warning = deadlineWarning(s, u, u.seconds), settled = timeoutNotice(s);
    // When this seat's turn starts, bring its controls up from below the fold.
    const actionArea = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (acting) actionArea.current?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    }, [acting, s.phase, s.round]);
    const seated = new Set([...s.teamA, ...s.teamB].map(p => p.id));
    const unseated = s.players.filter(p => !p.is_ai && !seated.has(p.id));
    const revealed = ['round_result', 'game_over'].includes(s.phase) ? [...s.history].reverse().find(row => row.round === s.round && row.secret?.length === 3) : undefined;
    const battery = h.batteryPercent !== null && <span className="mobile-battery" role="img" aria-label={t('电池电量 {0}%', [h.batteryPercent])}>
        <span className="mobile-battery-cells" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <i key={i} data-filled={i < h.batteryPercent! / 25}/>)}</span>
        <span aria-hidden="true">{h.batteryPercent}%</span>
    </span>;
    if (!h.online) return <section className="mobile-console" aria-label={t('便携通信终端')} inert={inert}>
        <header>{battery}<p className="mobile-brand">ENCRYPTO <span>FIELD TERMINAL / 01</span></p>
            <div className="mobile-title"><h2>{t(!h.powered ? '终端电源已关闭' : '已断开连接')}</h2></div>
            {h.powered && <p className="mobile-channel">CH 0000 · {t('离线')}</p>}</header>
        <p>{t(hardwareMessage(u, s))}</p>
        {h.powered && <>
            <section className="mobile-words"><h3>{t('我方秘密词')}</h3>
                <ol>{Array.from({ length: 4 }, (_, i) => <li key={i}><b>{i + 1}</b> {t('离线')}</li>)}</ol></section>
            <p>{t('连接恢复后，词窗与房间码将重新显示。')}</p>
            <p>{t('输入已保留，不会自动提交。')}</p>
            {!home && <button data-mobile-archive aria-keyshortcuts="H" onClick={() => onAct('archive-toggle')}>{t('密报记录')}</button>}
        </>}
    </section>;
    if (u.manual || u.about) return <section className="mobile-console" aria-label={t(u.about ? '原版桌游' : '玩法')} inert={inert}>
        <button onClick={() => onAct('screen-close')}>{t('返回操作')}</button>
        <GuideContent locale={u.locale} about={u.about}/>
        {u.about && <button aria-keyshortcuts="G" onClick={() => onAct('manual')}>{t('一图读懂玩法')}</button>}
    </section>;
    const words = !!s.myWords.length && <section className="mobile-words"><div><h3>{t('我方秘密词')}</h3><button onClick={() => onAct('words')}>{t(u.hiddenWords ? '显示' : '遮住')}</button></div><ol>{s.myWords.map((v, i) => <li key={i}><b>{i + 1}</b> {u.hiddenWords ? '••••' : word(v, u.locale)}</li>)}</ol></section>;
    const round = <>
        <div className="mobile-round"><strong>{t('第 {0} / 16 回合', [s.round])}</strong><button data-mobile-archive aria-keyshortcuts="H" onClick={() => onAct('archive-toggle')}>{t('密报记录')}</button></div>
        <div className="mobile-scores">{(['A', 'B'] as const).map(team => {
            const score = team === 'A' ? s.scoreA : s.scoreB;
            return <p key={team}><strong style={{ color: teamPalette(team, s.myTeam, u.theme).ink }}>{t('{0} 队', [team])}{team === s.myTeam ? t(' · 我方') : ''}</strong>
                <span style={{ color: '#2e6949' }}>{t('截获')} {score.interceptions} / 2</span>
                <span style={{ color: '#a44235' }}>{t('失误')} {score.decrypt_failures} / 2</span></p>;
        })}</div>
    </>;
    const disk = ownsDisk && <section className="mobile-key-disk" data-phase={diskCurrent ? u.keyDisk.phase : 'queued'} aria-label={t('本轮密钥软盘')}>
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
    </section>;
    const clueInputs = r.encrypt && u.clues.map((value, i) => <label key={i}>{t('线索 {0}', [i + 1])}
        <span className="mobile-clue-target">{diskReadable ? `${s.secretDigits[i]} · ${word(s.myWords[s.secretDigits[i] - 1] || s.secretWords[i], u.locale)}` : t('已隐藏')}</span><input data-console-input data-clue-index={i} value={value} maxLength={80} disabled={!r.active || disabled} onChange={e => onChange(`clue-${i}`, e.target.value)}
            onKeyDown={event => {
                if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat ||
                    event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                event.preventDefault();
                const terminal = event.currentTarget.closest('.mobile-console');
                terminal?.querySelector<HTMLElement>(i < 2 ? `[data-clue-index="${i + 1}"]` : '.mobile-action')?.focus();
            }}/></label>);
    // Each public clue sits beside the digit chosen for it; tapping a row picks the slot.
    const guessRows = r.guess && <>
        {peers.length > 0 && <ul className="mobile-peer-status" aria-label={t('队友状态')}>{peers.map(peer => <li key={peer.id} data-unavailable={peer.state === 'unavailable' || undefined}>
            <span>{peer.ai && !peer.player.startsWith('AI') ? t('AI · {0}', [peer.player]) : peer.player}</span>
            <small>{t(...teammateStatus(peer))}</small>
        </li>)}</ul>}
        <ol className="mobile-guess" aria-label={t('选择编号')}>{[0, 1, 2].map(i => <li key={i}><button aria-pressed={u.slot === i} disabled={!r.active || disabled} onClick={() => onAct(`slot-${i}`)}
            aria-label={t('选择第 {0} 位密码', [i + 1])}><b>{String(i + 1).padStart(2, '0')}</b><span>{s.clues[i] || t('等待线索…')}</span><em>{shownGuess[i] || '—'}</em></button>
            {peers.length > 0 && <ul className="mobile-peer-choices" aria-label={t('第 {0} 条线索的队友建议', [i + 1])}>{peers.map(peer => {
                const active = peer.focus === i + 1 && !peer.disconnected;
                return <li key={peer.id} data-active={active || undefined}>
                    <span>{peer.ai && !peer.player.startsWith('AI') ? t('AI · {0}', [peer.player]) : peer.player}</span><strong>{peer.guesses[i] || '—'}</strong>
                    {active && <small className="sr-only">{t('推敲中')}</small>}
                </li>;
            })}</ul>}
        </li>)}</ol>
        {peers.length > 0 && <p className="mobile-peer-note">{t('队友建议 · ACTION 提交你选的三位')}</p>}
        {!submitted && <div className="mobile-keypad">{[1, 2, 3, 4].map(n => <button key={n} disabled={!r.active || disabled} onClick={() => onAct(`key-${n - 1}`)}>{n}</button>)}<button disabled={!r.active || disabled} onClick={() => onAct('key-4')}>{t('退格')}</button></div>}
    </>;
    const watch = watching.length ? <>{watching.map(({ action, team, tx }) => <section key={action} aria-label={action === 'encrypt' ? t('实时进度') : t(action === 'intercept' ? '{0} 队拦截' : '{0} 队解码', [team || '—'])}>
        {action !== 'encrypt' && <h3 style={{ color: teamPalette(team, s.myTeam, u.theme).ink }}>{t(action === 'intercept' ? '{0} 队拦截' : '{0} 队解码', [team || '—'])}{tx.submitted ? ` · ${t('已提交')}` : ''}</h3>}
        <ol className="mobile-slots" aria-label={t('实时进度')}>{tx.slots.map((slot, i) => {
            const text = action === 'encrypt' ? t(slot.active ? slot.done ? '正在修改这一条…' : '正在写这一条…' : slot.done ? '已写好' : '等待') : s.clues[i] || t('等待线索…');
            const mark = action === 'encrypt' ? slot.done && !slot.active ? '✓' : '' : slot.active ? t('推敲中') : slot.digit ?
                `${slot.digit}${slot.match === undefined ? '' : ` · ${t(action === 'intercept' ? slot.match ? '猜中' : '未中' : slot.match ? '译对' : '译错')}`}` : slot.done ? t('已选定') : '—';
            return <li key={i} data-state={slot.active ? 'active' : slot.done ? 'done' : 'idle'}><b>{String(i + 1).padStart(2, '0')}</b><span>{text}</span>{mark && <em>{mark}</em>}</li>;
        })}</ol>
    </section>)}</> : beat && !r.guess && !r.encrypt && s.clues.length > 0 && <ol className="mobile-clues">{s.clues.map((v, i) => <li key={i}>{v}</li>)}</ol>;
    const verdicts = <div className="mobile-verdicts" aria-label={t('本轮判定')}>{resultSummary(s).map((item, i) =>
        <p key={i} style={{ color: item.tone === 'good' ? '#2e6949' : item.tone === 'bad' ? '#a44235' : undefined, fontWeight: item.scoring ? 600 : undefined }}>{t(...item.label)}</p>)}</div>;
    const result = s.phase === 'round_result' && (() => {
        const view = resultView(s);
        return <section className="mobile-outcome" aria-label={t('本轮回执')}>
            <h3>{t(...view.title)}</h3>{verdicts}
            <ol className="mobile-slots">{[0, 1, 2].map(i => <li key={i}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>{(revealed?.clues ?? s.clues)[i] || t('等待公开线索。')}
                    {revealed && <small style={{ display: 'block', marginBlock: '6px' }}>{[
                        ['截获', revealed.intercept], ['解码', revealed.decrypt],
                    ].map(([label, guess]) => {
                        const digit = (guess as number[] | undefined)?.[i];
                        return `${t(label as string)} ${digit ? `${digit} ${digit === revealed.secret![i] ? '✓' : '✗'}` : '—'}`;
                    }).join(' · ')}</small>}
                </span>
                {revealed && <em aria-label={t('本轮密码')}>{revealed.secret![i]}</em>}
            </li>)}</ol>
            {!revealed && <p>{view.sub ? t(...view.sub) : t('本轮结束后揭晓密码。')}</p>}
        </section>;
    })();
    const over = s.phase === 'game_over' && (() => {
        const view = gameOverView(s);
        return <section className="mobile-outcome" aria-label={t('行动结束')}>
            <h3 className="mobile-result">{t(...view.title)}</h3>
            <p>{[view.mine && t(view.mine), t(...view.reason)].filter(Boolean).join(' · ')}</p>
            {verdicts}
            {(['A', 'B'] as const).map(team => {
                const list = (team === 'A' ? s.gameOver?.wordsA : s.gameOver?.wordsB) ?? (team === s.myTeam ? s.myWords : []);
                return list.length > 0 && <p key={team}><strong>{t('{0} 队', [team])}{team === s.myTeam ? t(' · 我方') : ''}</strong> {list.map((v, i) => `${i + 1} ${word(v, u.locale)}`).join(' · ')}</p>;
            })}
            <button onClick={() => onAct('leave-room')}>{t('离开频道')}</button>
        </section>;
    })();
    return <section className="mobile-console" data-acting={acting || undefined} aria-label={t('便携通信终端')} inert={inert}>
        <header>{battery}{!beat && <p className="mobile-brand">ENCRYPTO <span>FIELD TERMINAL / 01</span></p>}
            <div className="mobile-title"><h2 style={signal.actingTeam ? { color: teamPalette(signal.actingTeam, s.myTeam, u.theme).ink } : undefined}>{title}</h2>{s.deadline > 0 && <span className="mobile-clock" data-urgent={!!warning || undefined} data-idle={!acting || undefined}>{u.seconds}s</span>}</div>
            <p className="mobile-channel" data-onboarding="room">{s.roomCode ? `CH ${s.roomCode}` : t('双队通信  /  4–8 人')} · {s.recovering ? t('正在恢复原座位…') : s.connected ? t('已连接') : t('连接中')}
                {s.myTeam && ` · ${t('{0} 队', [s.myTeam])}`}</p>
        </header>
        {home && <>
            <div className="mobile-tabs"><button aria-pressed={u.mode === 'create'} onClick={() => onAct('mode-create')}>{t('建立频道')}</button><button aria-pressed={u.mode === 'join'} onClick={() => onAct('mode-join')}>{t('加入频道')}</button></div>
            <label>{t('代号')}<input data-onboarding="enter" data-console-input autoComplete="nickname" value={u.name} maxLength={20} onChange={e => onChange('name', e.target.value)}/></label>
            {u.mode === 'join' && <label>{t('四位频道编号')}<input data-console-input inputMode="numeric" autoComplete="off" value={u.code} maxLength={4} placeholder="1234" onChange={e => onChange('code', e.target.value)}/></label>}
            <p>{t('每队至少两人，可以由 AI 补位。')}</p>
        </>}
        {lobby && <>
            <div className="mobile-tabs"><button onClick={() => onAct('copy-code')}>{t('复制频道编号')}</button><button data-mobile-archive aria-keyshortcuts="H" onClick={() => onAct('archive-toggle')}>{t('密报记录')}</button></div>
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
            {unseated.length > 0 && <p className="mobile-warning">{t('未入队：{0} · 开局后只能旁观', [unseated.map(p => p.id === s.myPlayerID ? t('你') : p.nickname).join(u.locale === 'zh' ? '、' : ', ')])}</p>}
            {!owner && <p>{t('等待房主开始行动')}</p>}
        </>}
        {!home && !lobby && <>
            {beat && (submitted || duty || warning || settled) && <div className="mobile-duty" role="status">
                {submitted ? <><p>{t(s.submitted ? '已提交' : '正在发送…')}</p><p>{s.submitted ? handover ? t(...handover) : t('已提交，等待结算。') : t('等待服务器确认。')}</p></> : duty && <p>▶ {t(...duty)}</p>}
                {!submitted && handover && <p>{t(...handover)}</p>}
                {(warning || settled) && <p className="mobile-warning">{t(...(warning || settled)!)}</p>}
            </div>}
            {workingArea ? <div ref={actionArea} className="mobile-action-area">
                {r.encrypt ? <>{disk}{clueInputs}</> : <>{words}{guessRows}</>}
            </div> : null}
            {round}
            {!workingArea && words}
            {s.phase !== 'game_over' && !workingArea && context ? <p>{context}</p> : null}
            {!workingArea && disk}
            {!workingArea && watch}
            {result}
            {over}
            {!workingArea && !submitted && beat && <p role="status">{watchStatus}</p>}
        </>}
        <p className="mobile-status" role={s.error ? 'alert' : 'status'}>{s.error ? localizeError(u.locale, s.error) : status}</p>
        <div className="mobile-audio" role="group" aria-label={t('声音')}>
            <button role="switch" aria-checked={u.soundOn} onClick={() => onAct('sound-toggle')}>{t(u.soundOn ? '关闭音效' : '开启音效')}</button>
            <button role="switch" aria-checked={u.musicOn} onClick={() => onAct('music-toggle')}>{t(u.musicOn ? '关闭背景音乐' : '开启背景音乐')}</button>
        </div>
        <nav className="mobile-tabs"><button aria-keyshortcuts="G" onClick={() => onAct('manual')}>{t('一图读懂玩法')}</button><button onClick={() => onAct('about')}>{t('原版桌游与购买')}</button></nav>
        <footer><button className="mobile-action" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={!ready || disabled} onClick={() => onAct('transmit')}><span>ACTION</span>{t(action)}</button></footer>
    </section>;
}
