import { useState, useEffect } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import { DeskClockTimer, PaperCard, AgentPanel, DossierButton, DossierEffectLayer } from '../components/dossier';

type GuessStatus = 'waiting' | 'correct' | 'wrong';

interface ClueRow {
  id: number;
  clue: string;
  correctAnswer: number;
  guess: number | null;
  status: GuessStatus;
}

// Correct answers pinned note card
function AnswerNoteCard({ answers }: { answers: number[] }) {
  return (
    <PaperCard variant="note" showPaperClip className="mx-auto max-w-sm">
      <div className="p-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-sm">🔒</span>
          <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack, opacity: 0.6 }}>
            正确答案（仅你可见）
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          {answers.map((num, i) => (
            <span key={i} className="flex items-center gap-3">
              <span
                className="text-2xl font-bold"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  color: rawColors.teamFriendly,
                }}
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

// Clue row with typewriter lines and stamp annotations
function ClueRowItem({ row }: { row: ClueRow }) {
  const getStatusColor = () => {
    switch (row.status) {
      case 'correct': return rawColors.teamFriendly;
      case 'wrong': return rawColors.intelRed;
      default: return rawColors.brassDim;
    }
  };

  const statusColor = getStatusColor();

  return (
    <div
      className="flex items-center gap-4 py-3 px-4 rounded transition-[background,border-color] duration-300"
      style={{
        background: row.status === 'correct' ? `${rawColors.teamFriendly}08`
          : row.status === 'wrong' ? `${rawColors.intelRed}08`
          : 'transparent',
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      <div className="flex-1">
        <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          线索 {row.id}
        </span>
        <div className="text-lg" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}>
          "{row.clue}"
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          猜：
        </span>

        {row.guess !== null ? (
          <span
            className="text-xl font-bold w-8 text-center"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: statusColor }}
          >
            {row.guess}
          </span>
        ) : (
          <span
            className="text-xl w-8 text-center blink"
            style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
          >
            ?
          </span>
        )}

        {row.status === 'correct' && (
          <span className="text-lg" aria-label="正确" style={{ color: rawColors.teamFriendly }}>✓</span>
        )}
        {row.status === 'wrong' && (
          <span className="flex items-center gap-1">
            <span className="text-lg" aria-label="错误" style={{ color: rawColors.intelRed }}>✗</span>
            <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.intelRedDim }}>
              应为{row.correctAnswer}
            </span>
          </span>
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
            ── 任务报告 ──
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
                  <span className="text-xs" style={{ color: rawColors.intelRedDim }}>(应为{row.correctAnswer})</span>
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
            得分：{correctCount} / 3
          </div>

          <DossierButton variant="secondary" size="medium" fullWidth onClick={onContinue}>
            继续任务
          </DossierButton>
        </div>
      </PaperCard>
      </div>
    </div>
  );
}

const mascotConfig = {
  waiting: { emoji: '🕵️', message: '密切关注中…' },
  correct: { emoji: '✅', message: '解码正确!' },
  wrong: { emoji: '❌', message: '解码失误!' },
  allCorrect: { emoji: '🎖️', message: '完美执行!' },
  hasErrors: { emoji: '📋', message: '需要改进线索…' },
};

export default function EncryptorWatching() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showSummary, setShowSummary] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('waiting');

  const correctAnswers = [3, 1, 4];
  const [clues, setClues] = useState<ClueRow[]>([
    { id: 1, clue: '苦涩', correctAnswer: 3, guess: null, status: 'waiting' },
    { id: 2, clue: '毛茸', correctAnswer: 1, guess: null, status: 'waiting' },
    { id: 3, clue: '开门', correctAnswer: 4, guess: null, status: 'waiting' },
  ]);

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

  // Simulate teammate guessing
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setClues((prev) => prev.map((c) => c.id === 1 ? { ...c, guess: 3, status: 'correct' as const } : c));
      setMascotState('correct');
      setTimeout(() => setMascotState('waiting'), 2000);
    }, 4000);

    const timer2 = setTimeout(() => {
      setClues((prev) => prev.map((c) => c.id === 2 ? { ...c, guess: 2, status: 'wrong' as const } : c));
      setMascotState('wrong');
      setTimeout(() => setMascotState('waiting'), 2000);
    }, 8000);

    const timer3 = setTimeout(() => {
      setClues((prev) => prev.map((c) => c.id === 3 ? { ...c, guess: 4, status: 'correct' as const } : c));
      setMascotState('hasErrors');
      setTimeout(() => setShowSummary(true), 1000);
    }, 12000);

    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.tensionNormalBg;
      case 'warning': return rawColors.tensionWarningBg;
      case 'tense': return rawColors.tensionTenseBg;
      case 'critical': return rawColors.tensionCriticalBg;
    }
  };

  const mascot = mascotConfig[mascotState];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-6">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Status */}
        <div className="flex flex-col items-center mt-2">
          <span className="text-sm" style={{ fontFamily: "'Special Elite', cursive", color: rawColors.cream }}>
            队友正在解码<span className="blink">…</span>
          </span>
        </div>

        {/* Correct answers */}
        <div className="px-4 mt-4">
          <AnswerNoteCard answers={correctAnswers} />
        </div>

        {/* Divider */}
        <div className="max-w-2xl mx-auto w-full mt-4 border-t" style={{ borderColor: rawColors.brassDim }} />

        {/* Real-time decode */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto" aria-live="polite">
          <div
            className="max-w-2xl mx-auto p-3 rounded-lg space-y-2"
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
