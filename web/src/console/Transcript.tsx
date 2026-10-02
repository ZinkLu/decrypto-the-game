import { archiveRows, consoleHardware, resultSummary, rosterTeams, teammateChoices, teammateStatus, word, type LocalState, type StationState } from './model';

interface Props {
    state: StationState;
    local: LocalState;
    hardware: ReturnType<typeof consoleHardware>;
    /** What the main screen says at its foot. */
    status: string;
    /** The key disk is in, so this seat may read the round's code. */
    diskReadable: boolean;
    /** The 3D machine could not start: the record is shown instead of only read out. */
    failed: boolean;
    t: (message: string, values?: unknown[]) => string;
}

/** Everything the machine shows, as text: for screen readers, and for a device that cannot draw the machine. */
export default function Transcript({ state: s, local: u, hardware, status, diskReadable, failed, t }: Props) {
    return <section hidden={!hardware.powered} className={failed ? 'fallback-readout' : 'sr-only'} aria-label={t("当前通信文字记录")}><h2>{t(hardware.online ? '当前通信' : '已断开连接')}</h2><p>{status}</p>
      {hardware.batteryPercent !== null && <p>{t('电池电量 {0}%', [hardware.batteryPercent])}</p>}
      {!hardware.online && <p>CH 0000 · {t('离线')}</p>}
      <p>{!hardware.online ? Array.from({ length: 4 }, (_, i) => `${i + 1} ${t('离线')}`).join(' · ') : u.hiddenWords ? t("秘密词已遮住") : s.myWords.map(value => word(value, u.locale)).join(' · ')}</p>
      <p>{hardware.online ? s.clues.join(' / ') : t('输入已保留，不会自动提交。')}</p>
      {hardware.online && !u.submitted && !s.submitted && teammateChoices(s).map(peer => <p key={peer.id}>
        {t('{0} 建议：{1}', [peer.ai && !peer.player.startsWith('AI') ? t('AI · {0}', [peer.player]) : peer.player, peer.guesses.map(digit => digit || '—').join(' · ')])}
        {` · ${t(...teammateStatus(peer))}`}
      </p>)}
      <p>{t('第 {0} 回合，加密者：{1}', [s.round, s.encryptor])} {diskReadable ? t("本轮私密密码：{0}", [s.secretDigits.join('、')]) : ''}</p>
      {(['A', 'B'] as const).map(team => <p key={team}>{t('{0} 队     截获 {1} / 2     失误 {2} / 2', [team, (team === 'A' ? s.scoreA : s.scoreB).interceptions, (team === 'A' ? s.scoreA : s.scoreB).decrypt_failures])}</p>)}
      {rosterTeams(s, u).map(team => <section key={team.team} aria-label={t("{0} 队名册", [team.team])}>
        <h3>{t('{0} 队 · {1} 人', [team.team, team.count])}{team.own ? t(" · 我方") : ''} · {t(team.summary)}</h3>
        <ul>{team.seats.map(seat => <li key={seat.code}>{seat.code} · {seat.player ? `${seat.player.nickname}${seat.self && seat.player.nickname !== '你' ? t(" · 你") : ''} · ${seat.player.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}` : t("空席")} · {t(...seat.statusLine)}{seat.progress ? t(" · 已完成 {0} / {1}", [seat.progress.step, seat.progress.total]) : ''}</li>)}</ul>
      </section>)}
      {s.gameOver && <p>{s.gameOver.winner ? t("{0} 队获胜", [s.gameOver.winner]) : t("双方平局")}</p>}
      {['round_result', 'game_over'].includes(s.phase) && resultSummary(s).map((result, i) => <p key={i}>{t(...result.label)}</p>)}
      {archiveRows(s, 'all').map(row => <p key={row.round}>{t('第 {0} 回合 · {1} 队', [row.round, row.team])}: {row.clues.join(' / ')} · {t('公开密码')} {row.secret?.join(' · ') || t("未公开")}</p>)}
    </section>;
}
