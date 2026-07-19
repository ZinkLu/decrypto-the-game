import { useState, useEffect, useMemo } from 'react';
import { rawColors } from '../theme/colors';
import {
  DeskClockTimer,
  PaperCard,
  AgentPanel,
  DossierButton,
  DossierEffectLayer,
  SelectorOscilloscope,
} from '../components/dossier';
import type { SelectorStatus, SelectorResult } from '../components/dossier';
import { useGameStore } from '../store/gameStore';
import { useCountdown } from '../hooks/useCountdown';

type GuessStatus = 'waiting' | 'correct' | 'wrong';

interface ClueRow {
  id: number;
  clue: string;
  correctAnswer: number;
  guess: number | null;
  status: GuessStatus;
}

// Correct answers pinned note card (encryptor only)
function AnswerNoteCard({ answers }: { answers: number[] }) {
  return (
    <PaperCard variant="note" showPaperClip className="mx-auto max-w-sm">
      <div className="p-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-sm">🔒</span>
          <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack, opacity: 0.6 }}>
            Correct answers (only you)
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          {answers.map((num, i) => (
            <span key={i} className="flex items-center gap-3">
              <span
                className="text-2xl font-bold"
                style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamFriendly }}
              >
                {num}
              </span>
              {i < answers.length - 1 && (
                <span className="text-sm" style={{ color: rawColors.brassDim }}>→</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </PaperCard>
  );
}

function ClueRowItem({ row }: { row: ClueRow }) {
  const selectorStatus: SelectorStatus =
    row.guess !== null && row.guess > 0 ? 'locked'
    : row.guess === -1 ? 'thinking'
    : 'waiting';
  const selectorResult: SelectorResult =
    row.status === 'correct' ? 'correct'
    : row.status === 'wrong' ? 'wrong'
    : 'pending';
  const borderColor =
    row.status === 'correct' ? rawColors.teamFriendly
    : row.status === 'wrong' ? rawColors.intelRed
    : rawColors.brassDim;

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded transition-[background,border-color] duration-300"
      style={{
        background: row.status === 'correct' ? `${rawColors.teamFriendly}08`
          : row.status === 'wrong' ? `${rawColors.intelRed}08`
          : 'transparent',
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex flex-col items-start shrink-0" style={{ width: '110px' }}>
        <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          CLUE #{row.id}
        </span>
        <span
          className="text-base truncate w-full"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}
        >
          "{row.clue}"
        </span>
      </div>

      <SelectorOscilloscope
        digit={row.guess && row.guess > 0 ? row.guess : null}
        status={selectorStatus}
        result={selectorResult}
        correctDigit={row.correctAnswer}
        theme="friendly"
        width={104}
        height={48}
      />

      <div className="flex-1 min-w-0 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
        {row.status === 'correct' && (
          <span style={{ color: rawColors.teamFriendly }}>match — decoded ✓</span>
        )}
        {row.status === 'wrong' && (
          <span style={{ color: rawColors.intelRed }}>miss — was {row.correctAnswer}</span>
        )}
        {row.status === 'waiting' && row.guess === -1 && (
          <span style={{ color: rawColors.brass }}>thinking…</span>
        )}
        {row.status === 'waiting' && row.guess === null && (
          <span style={{ color: rawColors.brassDim, fontStyle: 'italic' }}>not yet…</span>
        )}
      </div>
    </div>
  );
}

// Mission report summary modal
function MissionReport({ clues, onContinue }: { clues: ClueRow[]; onContinue: () => void }) {
  const correctCount = clues.filter((c) => c.status === 'correct').length;

  useEffect(() => {
    const timer = setTimeout(onContinue, 3000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onContinue(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog" aria-modal="true" aria-labelledby="mission-report-title"
      style={{ background: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onContinue}
    >
      <div className="mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
      <PaperCard showPaperClip>
        <div className="p-6">
          <div
            id="mission-report-title"
            className="text-center text-lg mb-4"
            style={{ fontFamily: "'Special Elite', cursive", color: rawColors.inkBlack }}
          >
            ── MISSION REPORT ──
          </div>

          <div className="space-y-2 mb-4">
            {clues.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 px-3 py-1 rounded"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  color: row.status === 'correct' ? rawColors.teamFriendly : rawColors.intelRed,
                  background: row.status === 'wrong' ? `${rawColors.intelRed}10` : 'transparent',
                }}
              >
                <span className="text-sm" style={{ color: rawColors.inkBlack }}>"{row.clue}"</span>
                <span className="text-sm">→</span>
                <span className="font-bold">{row.guess}</span>
                <span>{row.status === 'correct' ? '✓' : '✗'}</span>
                {row.status === 'wrong' && (
                  <span className="text-xs" style={{ color: rawColors.intelRedDim }}>(was {row.correctAnswer})</span>
                )}
              </div>
            ))}
          </div>

          <div
            className="text-center text-lg mb-3"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: '2px',
              color: correctCount === 3 ? rawColors.teamFriendly : rawColors.brass,
            }}
          >
            Score: {correctCount} / 3
          </div>

          <DossierButton variant="secondary" size="medium" fullWidth onClick={onContinue}>
            CONTINUE
          </DossierButton>
        </div>
      </PaperCard>
      </div>
    </div>
  );
}

const mascotConfig = {
  waiting: { emoji: '🕵️', message: 'Monitoring closely...' },
  correct: { emoji: '✅', message: 'Decoded correctly!' },
  wrong: { emoji: '❌', message: 'Decode error!' },
  allCorrect: { emoji: '🎖️', message: 'Flawless execution!' },
  hasErrors: { emoji: '📋', message: 'Clues need improvement...' },
};

export default function EncryptorWatching() {
  const { clues: storeClues, secretDigits, aiStatus, playerProgress } = useGameStore();

  const { timeLeft, tension } = useCountdown({ totalSeconds: 90 });
  const [showSummary, setShowSummary] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('waiting');

  const correctAnswers = secretDigits.length > 0 ? secretDigits : [0, 0, 0];

  // Derive each row's live state from playerProgress guesses + aiStatus fallback
  const clues = useMemo<ClueRow[]>(() => {
    const decryptProgress = playerProgress?.action === 'decrypt' ? playerProgress : null;
    const guesses = decryptProgress?.guesses ?? [0, 0, 0];
    const focus = decryptProgress?.focus ?? 0;
    const aiStep = aiStatus?.action === 'decrypt' ? aiStatus.step : 0;

    return storeClues.map((clue, i) => {
      const slotNum = i + 1;
      const guess = guesses[i] ?? 0;
      const correct = secretDigits[i] || 0;
      let guessValue: number | null = null;
      let status: GuessStatus = 'waiting';

      if (guess > 0) {
        guessValue = guess;
        status = guess === correct ? 'correct' : 'wrong';
      } else if (focus === slotNum || (aiStep > 0 && aiStep === slotNum)) {
        // Teammate actively considering this slot (thinking)
        guessValue = -1;
      } else if (aiStep > 0 && aiStep > slotNum) {
        // AI already past this slot but we don't have the digit — show thinking
        guessValue = -1;
      }

      return {
        id: slotNum,
        clue,
        correctAnswer: correct,
        guess: guessValue,
        status,
      };
    });
  }, [storeClues, secretDigits, playerProgress, aiStatus]);

  // Mascot reactions as guesses resolve
  useEffect(() => {
    const anyResolved = clues.some((c) => c.guess !== null && c.guess > 0);
    if (!anyResolved) { setMascotState('waiting'); return; }
    const anyWrong = clues.some((c) => c.status === 'wrong');
    const allFilled = clues.every((c) => c.guess !== null && c.guess > 0);
    if (allFilled) {
      setMascotState(anyWrong ? 'hasErrors' : 'allCorrect');
      setShowSummary(true);
    } else if (anyWrong) {
      setMascotState('wrong');
    } else {
      setMascotState('correct');
    }
  }, [clues]);

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.tensionNormalBg;
      case 'warning': return rawColors.tensionWarningBg;
      case 'tense': return rawColors.tensionTenseBg;
      case 'critical': return rawColors.tensionCriticalBg;
    }
  };

  const isAIDecrypting = aiStatus?.action === 'decrypt';
  const mascot = isAIDecrypting
    ? { emoji: '🤖', message: `AI teammate decoding... (${aiStatus!.step}/${aiStatus!.total})` }
    : mascotConfig[mascotState];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer timeLeft={timeLeft} totalSeconds={90} tension={tension} showProgressBar={true} size="medium" />
        </div>

        {/* Status */}
        <div className="flex flex-col items-center mt-2">
          <span className="text-sm" style={{ fontFamily: "'Special Elite', cursive", color: rawColors.cream }}>
            Teammate decoding<span className="blink">...</span>
          </span>
        </div>

        {/* Correct answers */}
        <div className="px-4 mt-3">
          <AnswerNoteCard answers={correctAnswers} />
        </div>

        {/* Clue rows with live selector scopes */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto" aria-live="polite">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg space-y-2"
            style={{ background: rawColors.navyLight, border: `1px solid ${rawColors.brassDim}` }}
          >
            {clues.map((row) => (
              <ClueRowItem key={row.id} row={row} />
            ))}
          </div>
        </div>

        {/* Bottom agent */}
        <div className="pb-4 px-4 mt-2">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="friendly" />
        </div>
      </div>

      {showSummary && <MissionReport clues={clues} onContinue={() => setShowSummary(false)} />}
    </div>
  );
}
