import { useRef, useState, type SetStateAction } from 'react';
import type { PlayerInfo, ScoreChange } from '../store/gameStore';
import { defaultDotFilter, dotFilterOptions, readDotFilter, readWordScale, type DotFilter } from './dotFiltering';
import type { WordDisplay } from './dotMatrix';
import { instrumentOptions, previewState, wordDisplayOptions, type InstrumentVariant, type LocalState, type StationState } from './model';
import { detail, preview, remember, scoreBench, wordBench } from './options';

// The development benches: fixtures that can be changed by hand, and hardware
// kept for comparison. None of this is reachable in a production build.

type Translate = (message: string, values?: unknown[]) => string;
type Scores = Record<'A' | 'B', { interceptions: number; decrypt_failures: number }>;

// Bench word sets cover every layout: one to five ideographs, doubled and tall sign type, two lines and a marquee.
const benchWords = [
    ['亚特兰蒂斯[atlantis]', '龙[dragon]', '巴黎圣母院[notre dame]', '莎士比亚[shakespeare]'],
    ['潜水员[scuba diver]', '王牌[ace]', '听诊器[stethoscope]', '百万富翁[millionaire]'],
];

/** Where the first dial of each instrument stands when it is fitted. */
export const benchAmplitude = (variant: InstrumentVariant) => variant === 'signal' ? 14 : variant === 'tuning' ? 4 : variant === 'status' ? 0 : 2;

export function useBench() {
    const [people, setPeople] = useState<PlayerInfo[]>([{ id: '0', nickname: '你', is_ai: false }]);
    const serial = useRef(1);
    const [wordSet, setWordSet] = useState(0);
    const [scoreState, setScoreState] = useState<{ scores: Scores; scoreChange: ScoreChange | null; serial: number }>({
        scores: { A: { interceptions: 1, decrypt_failures: 0 }, B: { interceptions: 0, decrypt_failures: 1 } }, scoreChange: null, serial: 0,
    });
    const { scores, scoreChange } = scoreState;
    function setScores(value: SetStateAction<Scores>) {
        const at = Date.now();
        setScoreState(previous => {
            const next = typeof value === 'function' ? value(previous.scores) : value;
            const changes: ScoreChange['changes'] = [];
            for (const team of ['A', 'B'] as const) for (const field of ['interceptions', 'decrypt_failures'] as const)
                if (next[team][field] > previous.scores[team][field]) changes.push({ team,
                    kind: field === 'interceptions' ? 'intercept' : 'failure', total: next[team][field] });
            const serial = previous.serial + 1;
            return { scores: next, serial, scoreChange: changes.length ? { id: serial, at, round: 5, changes } : null };
        });
    }
    const [instrumentCloseup, setInstrumentCloseup] = useState(detail === 'meter');
    const [wordZoom, setWordZoom] = useState(() => readWordScale(new URLSearchParams(location.search).get('zoom'), detail === 'words'));
    const [dotFilter, setDotFilter] = useState<DotFilter>(() => wordBench ? readDotFilter(new URLSearchParams(location.search).get('filter')) : defaultDotFilter);
    function seat(action: 'human' | 'ai' | 'remove' | 'replace') {
        if (preview !== 'roster-motion') return;
        const n = serial.current++;
        const player = { id: `preview-${n}`, nickname: action === 'human' ? `夜航员 ${n}` : `AI · ${String(n).padStart(2, '0')}`, is_ai: action !== 'human' };
        setPeople(people => action === 'remove' ? people.slice(0, -1) :
            action === 'replace' ? [...people.slice(0, -1), player] : [...people, player].slice(0, 4));
    }
    return { people, seat, wordSet, setWordSet, scores, scoreChange, setScores, instrumentCloseup, setInstrumentCloseup, wordZoom, setWordZoom, dotFilter, setDotFilter };
}
export type Bench = ReturnType<typeof useBench>;

/** The game the machine shows: the live one, a fixture, or a fixture as the bench changed it. */
export function benchState(live: StationState, locale: LocalState['locale'], bench: Pick<Bench, 'people' | 'wordSet' | 'scores' | 'scoreChange'>): StationState {
    if (preview !== 'roster-motion') {
        const state = preview ? previewState(live, preview, locale) : live;
        if (scoreBench) return { ...state, scoreA: bench.scores.A, scoreB: bench.scores.B, scoreChange: bench.scoreChange };
        return wordBench && bench.wordSet && state.myWords.length ? { ...state, myWords: benchWords[bench.wordSet - 1] } : state;
    }
    const state = previewState(live, 'room-partial', locale);
    return { ...state, teamA: bench.people, players: [...bench.people, ...state.teamB],
        canStart: bench.people.length >= 2 };
}

export function ScoreBench({ bench, powered, t }: { bench: Bench; powered: boolean; t: Translate }) {
    return <div className="station-roster-preview station-score-preview" aria-label={t('翻旗积分板试装')}>
        <span>{t('翻旗试装')}</span>
        {(['A', 'B'] as const).flatMap(team => (['interceptions', 'decrypt_failures'] as const).map(field =>
          <button key={`${team}-${field}`} disabled={!powered}
            aria-label={t('循环切换 {0} 队{1}计分', [team, t(field === 'interceptions' ? '截获' : '失误')])}
            onClick={() => bench.setScores(scores => ({ ...scores,
              [team]: { ...scores[team], [field]: (scores[team][field] + 1) % 3 } }))}>
            {team} · {t(field === 'interceptions' ? '截获' : '失误')} {bench.scores[team][field]}/2
          </button>))}
        <button disabled={!powered} onClick={() => bench.setScores({
          A: { interceptions: 0, decrypt_failures: 0 }, B: { interceptions: 0, decrypt_failures: 0 },
        })}>{t('清零')}</button>
      </div>;
}

export function RosterBench({ bench, t }: { bench: Bench; t: Translate }) {
    const seated = bench.people.length;
    return <div className="station-roster-preview" aria-label={t("名牌动画预览")}>
        <span>{t("名牌演示")}</span>
        <button disabled={seated >= 4} onClick={() => bench.seat('human')}>{t("真人入席")}</button>
        <button disabled={seated >= 4} onClick={() => bench.seat('ai')}>{t("AI 入席")}</button>
        <button disabled={!seated} onClick={() => bench.seat('remove')}>{t("末席离开")}</button>
        <button disabled={!seated} onClick={() => bench.seat('replace')}>{t("替换末席")}</button>
      </div>;
}

interface BenchProps {
    bench: Bench;
    local: LocalState;
    powered: boolean;
    inert: boolean;
    t: Translate;
    onPatch: (values: Partial<LocalState>) => void;
    announce: (message: string) => void;
}

export function InstrumentBench({ bench, local: u, powered, inert, t, onPatch, announce, onInspect, onHint }: BenchProps & {
    onInspect: (closeup: boolean) => void; onHint: (hint: string) => void }) {
    function select(variant: InstrumentVariant) {
        onPatch({ instrumentVariant: variant, meterAmplitude: benchAmplitude(variant), meterRate: 2, instrumentDemo: false });
        remember(params => params.set('instruments', variant));
        onHint('');
        announce(t("已试装{0}", [t(instrumentOptions.find(option => option.id === variant)?.label || '')]));
    }
    function inspect(closeup: boolean) {
        bench.setInstrumentCloseup(closeup);
        onInspect(closeup);
        remember(params => { if (closeup) params.set('detail', 'meter'); else params.delete('detail'); });
    }
    return <section className="instrument-comparison" aria-label={t("仪表造型对比")} inert={inert}>
      <div className="instrument-comparison-row">
        <span className="instrument-comparison-title">{t("仪表试装")}</span>
        <div className="instrument-options" role="group" aria-label={t("选择仪表方案")}>
          {instrumentOptions.map(option => <button key={option.id} aria-pressed={u.instrumentVariant === option.id}
              onClick={() => select(option.id)}>{t(option.label)}</button>)}
        </div>
        <div className="instrument-view" role="group" aria-label={t("观察距离")}>
          <button aria-pressed={!bench.instrumentCloseup} onClick={() => inspect(false)}>{t("整机")}</button>
          <button aria-pressed={bench.instrumentCloseup} onClick={() => inspect(true)}>{t("看细节")}</button>
        </div>
        {u.instrumentVariant !== 'signal' && <button className="instrument-demo" disabled={!powered || u.instrumentVariant === 'original'}
            aria-pressed={u.instrumentDemo} onClick={() => onPatch({ instrumentDemo: !u.instrumentDemo })}>
          {u.instrumentDemo ? t("停止演示") : t("动态演示")}
        </button>}
      </div>
      <div className="instrument-comparison-row instrument-description">
        <p>{t(instrumentOptions.find(option => option.id === u.instrumentVariant)?.description || '')}</p>
        <span>{t("旋钮可点击、拖动或滚轮调整 · 中键旋转机身")}</span>
      </div>
    </section>;
}

export function WordBench({ bench, local: u, powered, inert, t, onPatch, announce }: BenchProps) {
    const closeup = bench.wordZoom > 1;
    function select(display: WordDisplay) {
        onPatch({ wordDisplay: display });
        remember(params => params.set('words', display));
        announce(t("已试装{0}", [t(wordDisplayOptions.find(option => option.id === display)?.label || '')]));
    }
    function zoom(scale: number) {
        bench.setWordZoom(scale);
        remember(params => {
            params.set('zoom', String(scale));
            if (scale > 1) params.set('detail', 'words'); else params.delete('detail');
        });
    }
    function filter(filter: DotFilter) {
        bench.setDotFilter(filter);
        remember(params => params.set('filter', filter));
        announce(t('LED 缩放：{0}', [t(dotFilterOptions.find(option => option.id === filter)!.label)]));
    }
    return <section className="instrument-comparison" aria-label={t("词窗方案对比")} inert={inert}>
      <div className="instrument-comparison-row">
        <span className="instrument-comparison-title">{t("词窗试装")}</span>
        <div className="instrument-options" role="group" aria-label={t("选择词窗方案")}>
          {wordDisplayOptions.map(option => <button key={option.id} aria-pressed={u.wordDisplay === option.id}
              onClick={() => select(option.id)}>{t(option.label)}</button>)}
        </div>
        <div className="instrument-view" role="group" aria-label={t("观察距离")}>
          <button aria-pressed={!closeup} onClick={() => zoom(1)}>{t("整机")}</button>
          <button aria-pressed={closeup} onClick={() => zoom(2)}>{t("看细节")}</button>
          <label className="word-zoom">
            <span>{t('缩放')}</span>
            <input type="range" min="1" max="4" step="0.05" value={bench.wordZoom} aria-label={t('密码板缩放')}
                onChange={event => zoom(Number(event.target.value))}/>
            <output>{bench.wordZoom.toFixed(2)}×</output>
          </label>
        </div>
        <button className="instrument-demo" disabled={!powered} onClick={() => bench.setWordSet(set => (set + 1) % (benchWords.length + 1))}>{t("换一组词")}</button>
      </div>
      <div className="instrument-comparison-row word-filter-row">
        <span className="instrument-comparison-title">{t('LED 缩放')}</span>
        <div className="instrument-options word-filter-options" role="group" aria-label={t('选择 LED 缩放算法')}>
          {dotFilterOptions.map(option => <button key={option.id} aria-pressed={bench.dotFilter === option.id}
              disabled={u.wordDisplay !== 'led'} onClick={() => filter(option.id)}>{t(option.label)}</button>)}
        </div>
      </div>
      <div className="instrument-comparison-row instrument-description">
        <p>{t((u.wordDisplay === 'led' ? dotFilterOptions.find(option => option.id === bench.dotFilter) : wordDisplayOptions.find(option => option.id === u.wordDisplay))?.description || '')}</p>
        <span>{t('切换算法保持词组、配色与距离')}</span>
      </div>
    </section>;
}
