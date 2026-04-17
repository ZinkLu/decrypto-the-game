import { useState, useEffect, useMemo } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import { DeskClockTimer, AgentPanel, RubberStamp, DossierEffectLayer, SelectorOscilloscope } from '../components/dossier';
import type { SelectorStatus } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

interface IntelRow {
  round: number;
  clues: string[];
  sequence: string;
  isCurrent: boolean;
}

// Current round clues display
function CurrentClues({ clues }: { clues: string[] }) {
  return (
    <div
      className="px-4 py-3 rounded-lg"
      style={{ background: `${rawColors.teamEnemy}10`, border: `2px solid ${rawColors.opponentNormalBorder}` }}
    >
      <div className="text-xs mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
        Current Clues
      </div>
      <div className="flex items-center justify-center gap-3">
        {clues.map((clue, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="text-lg font-bold" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemy }}>
              "{clue}"
            </span>
            {i < clues.length - 1 && (
              <span className="text-sm" style={{ color: rawColors.teamEnemyDim }}>/</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Intel table as typed report
function IntelTable({ data, highlightedWord, onWordClick }: { data: IntelRow[]; highlightedWord: string | null; onWordClick: (word: string) => void }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: rawColors.opponentCrtScreen, border: `1px solid ${rawColors.opponentNormalBorder}` }}>
      {/* Header */}
      <div
        className="flex px-3 py-2 text-xs"
        style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim, borderBottom: `1px solid ${rawColors.opponentNormalBorder}` }}
      >
        <span className="w-12">RND</span>
        <span className="flex-1">Clues</span>
        <span className="w-24 text-right">Known Order</span>
      </div>

      {data.map((row) => (
        <div
          key={row.round}
          className="flex px-3 py-2 items-center transition-[background] duration-300"
          style={{
            fontFamily: "'Courier Prime', monospace",
            background: row.isCurrent ? `${rawColors.teamEnemy}10` : 'transparent',
            borderBottom: `1px solid ${rawColors.opponentNormalBorder}30`,
          }}
        >
          <span className="w-12 text-sm" style={{ color: rawColors.teamEnemyDim }}>R{row.round}</span>
          <span className="flex-1 flex items-center gap-1 flex-wrap">
            {row.clues.map((clue, i) => (
              <span key={i} className="flex items-center gap-1">
                <button
                  className="text-sm cursor-pointer px-1 rounded transition-colors duration-200"
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    border: 'none',
                    color: highlightedWord === clue ? rawColors.teamEnemy : rawColors.cream,
                    background: highlightedWord === clue ? `${rawColors.teamEnemy}20` : 'transparent',
                  }}
                  onClick={() => onWordClick(clue)}
                >
                  {clue}
                </button>
                {i < row.clues.length - 1 && (
                  <span className="text-xs" style={{ color: rawColors.teamEnemyDim }}>/</span>
                )}
              </span>
            ))}
          </span>
          <span
            className="w-24 text-right text-sm"
            style={{
              color: row.isCurrent ? rawColors.teamEnemy : rawColors.teamEnemyDim,
              fontWeight: row.isCurrent ? 'bold' : 'normal',
            }}
          >
            {row.sequence}
          </span>
        </div>
      ))}
    </div>
  );
}

const mascotConfig = {
  analyzing: { emoji: '🔍', message: 'Reasoning...' },
  comparing: { emoji: '📊', message: 'Comparing data...' },
  progress: { emoji: '💡', message: 'Getting close!' },
  ready: { emoji: '🎯', message: 'Time to strike!' },
  pressure: { emoji: '⚠️', message: 'Decide now!' },
  critical: { emoji: '🚨', message: 'Emergency!' },
};

export default function OpponentAnalyzing() {
  const { clues: storeClues, history: gameHistory, round, aiStatus, playerProgress } = useGameStore();

  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [highlightedWord, setHighlightedWord] = useState<string | null>(null);

  const circledDigits = ['①', '②', '③', '④'];
  const intelData: IntelRow[] = useMemo(() => {
    const historyRows: IntelRow[] = gameHistory
      .filter((row) => row.clues.length > 0)
      .map((row) => ({
        round: row.round,
        clues: row.clues,
        sequence: row.secret
          ? row.secret.map((n) => circledDigits[n - 1] || String(n)).join(' ')
          : '???',
        isCurrent: false,
      }));
    // Add current round
    if (storeClues.length > 0) {
      historyRows.push({
        round,
        clues: storeClues,
        sequence: '???',
        isCurrent: true,
      });
    }
    return historyRows;
  }, [gameHistory, storeClues, round]);

  const currentClues = storeClues;

  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.opponentNormalBg;
      case 'warning': return rawColors.opponentWarningBg;
      case 'tense': return rawColors.opponentTenseBg;
      case 'critical': return rawColors.opponentCriticalBg;
    }
  };

  const getMascotState = (): keyof typeof mascotConfig => {
    if (tension === 'critical') return 'critical';
    if (tension === 'tense') return 'pressure';
    if (tension === 'warning') return 'progress';
    return 'analyzing';
  };

  const handleWordClick = (word: string) => {
    setHighlightedWord((prev) => (prev === word ? null : word));
  };

  const isAIDecrypting = aiStatus?.action === 'decrypt';
  const decryptStep = (aiStatus?.action === 'decrypt' ? aiStatus.step : 0)
    || (playerProgress?.action === 'decrypt' ? playerProgress.step : 0);
  const mascot = isAIDecrypting
    ? { emoji: '🤖', message: `Enemy AI decoding... (${aiStatus!.step}/${aiStatus!.total})` }
    : decryptStep > 0
      ? { emoji: '👀', message: `Enemy decoding... (${decryptStep}/3)` }
      : mascotConfig[getMascotState()];

  // Live decode feed — derive per-slot state for the enemy team's decrypting
  const decryptProgress = playerProgress?.action === 'decrypt' ? playerProgress : null;
  const decryptGuesses = decryptProgress?.guesses ?? [0, 0, 0];
  const decryptFocus = decryptProgress?.focus ?? 0;
  const aiDecryptStep = aiStatus?.action === 'decrypt' ? aiStatus.step : 0;

  const slotLiveState = (i: number): { status: SelectorStatus; digit: number | null } => {
    const slotNum = i + 1;
    const g = decryptGuesses[i] ?? 0;
    if (g > 0) return { status: 'locked', digit: g };
    if (decryptFocus === slotNum || aiDecryptStep === slotNum || (aiDecryptStep > 0 && aiDecryptStep > slotNum)) {
      return { status: 'thinking', digit: null };
    }
    return { status: 'waiting', digit: null };
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0505 100%)` }}
    >
      <DossierEffectLayer />

      {/* Critical pulse */}
      {tension === 'critical' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ background: 'rgba(139, 0, 0, 0.05)', animation: 'pulse-red 1s ease-in-out infinite' }}
        />
      )}

      {/* WARNING stamp on critical */}
      {tension === 'critical' && (
        <div className="absolute top-8 right-8 z-20 pointer-events-none">
          <RubberStamp text="WARNING" color="red" size="large" rotation={-8} animated />
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        {/* Title */}
        <div className="text-center mt-2 text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemy, letterSpacing: '4px' }}>
          INTELLIGENCE ANALYSIS
        </div>

        {/* Main content */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto">
          <div
            className="max-w-2xl mx-auto p-4 rounded-lg"
            style={{
              background: rawColors.opponentScreenBg,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
            }}
          >
            {/* Current clues */}
            <div className="mt-2">
              <CurrentClues clues={currentClues} />
            </div>

            {/* Live decode feed — three selector scopes mirroring enemy decoder */}
            <div className="mt-3">
              <div
                className="text-xs mb-2 flex items-center justify-between"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}
              >
                <span>Enemy Decode Feed</span>
                <span>{decryptGuesses.filter((g) => g > 0).length}/3 LOCKED</span>
              </div>
              <div className="flex justify-center gap-3">
                {[0, 1, 2].map((i) => {
                  const live = slotLiveState(i);
                  return (
                    <div key={i} className="flex flex-col items-center">
                      <span
                        className="text-xs mb-1"
                        style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}
                      >
                        C{i + 1} "{currentClues[i] ?? '...'}"
                      </span>
                      <SelectorOscilloscope
                        digit={live.digit}
                        status={live.status}
                        theme="enemy"
                        width={104}
                        height={48}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="my-3 border-t" style={{ borderColor: rawColors.opponentNormalBorder }} />

            {/* Historical intel */}
            <div className="mb-2">
              <div className="text-xs mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
                Historical Intel
              </div>
              <IntelTable data={intelData} highlightedWord={highlightedWord} onWordClick={handleWordClick} />
            </div>
          </div>
        </div>

        {/* Agent area */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="enemy" />
        </div>
      </div>
    </div>
  );
}
