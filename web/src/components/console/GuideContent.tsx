import { translate, type Locale } from './i18n';
import { gameIntroduction, guideArtUrl, guideClues, guideHistory, guideOpening, guideOutcome, guideRules, guideSteps, guideWords, originalGameLinks } from './guide';

/** Native companion to the CRT: readable on small screens and by assistive tech. */
export default function GuideContent({ locale, about = false, transcript = false }: { locale: Locale; about?: boolean; transcript?: boolean }) {
    const t = (key: string, values?: unknown[]) => translate(locale, key, values);
    const step = (index: number) => <h3 className="field-guide-heading"><b>{index + 1}</b><span>{t(guideSteps[index])}</span></h3>;
    const history = <section className="field-guide-history">
        <h3>{t('前几轮的线索与答案')}</h3>
        <small>{t('同一队的记录')}</small>
        <table><thead><tr><th></th><th>{t('公开线索')}</th><th>{t('揭晓密码')}</th></tr></thead>
            <tbody>{guideHistory.map((row, i) => <tr key={i}>
                <th scope="row">{t('第 {0} 次', [i + 1])}</th>
                <td>{row.clues.map(clue => t(clue)).join(' · ')}</td>
                <td>{row.code.join('·')}</td>
            </tr>)}</tbody>
        </table>
    </section>;
    return <div className="field-guide">
        <h2 className={about ? undefined : 'field-guide-title'}>{t(about ? '原版桌游' : '四步看懂玩法')}</h2>
        {about ? <><p>DECRYPTO · Le Scorpion Masqué</p><p>{t(gameIntroduction)}</p><p>{t('非官方线上改编 · 喜欢这场交锋，也请支持原版。')}</p></> : <>
            {!transcript && <div className="field-guide-flow">
                {step(0)}
                <div className="field-guide-words">{guideWords.map((word, i) => <span key={word}><b>{i + 1}</b>{t(word)}</span>)}</div>
                {step(1)}
                <div className="field-guide-step"><i className="field-agent" style={{ backgroundImage: `url(${guideArtUrl})` }}/><div><h3>{t('加密者')}</h3><small>{t('看密词，为三个编号各想一条线索。')}</small></div></div>
                <h3>{t('加密者抽到的密码')}</h3><div className="field-guide-words">{guideClues.map((clue, i) => <span key={clue}><b>{[3, 1, 4][i]} ↓</b>{t(clue)}</span>)}</div><small>{t('公开线索 · 只说词，不说编号')}</small>
                {step(2)}
                {history}
                <div className="field-guide-step"><i className="field-agent" style={{ backgroundImage: `url(${guideArtUrl})`, backgroundPosition: 'right center' }}/><div><h3>{t('对手 · 看记录拦截')}</h3><small>{t('先猜')} · 2 · 1 · 4 ×</small></div></div>
                {step(3)}
                <div className="field-guide-step"><i className="field-agent" style={{ backgroundImage: `url(${guideArtUrl})`, backgroundPosition: 'center' }}/><div><h3>{t('队友 · 看密词解码')}</h3><small>{t('后猜')}</small><strong className="field-code">3 · 1 · 4 ✓</strong></div></div>
                <small>{t('三个编号，顺序全对才成功。')}</small>
            </div>}
            {transcript && <ol>{guideSteps.map(title => <li key={title}>{t(title)}</li>)}</ol>}
            <div className={transcript ? undefined : 'sr-only'}>{guideRules.map(rule => <p key={rule}>{t(rule)}</p>)}</div>
            {!transcript && <p className="field-guide-footnote">{t(guideOutcome)}<br/>{t(guideOpening)}</p>}
            {transcript && history}
        </>}
        {!transcript && <nav aria-label={t('原版桌游')}>{originalGameLinks.map(link => <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer">{t(link.label)} ↗</a>)}</nav>}
    </div>;
}
