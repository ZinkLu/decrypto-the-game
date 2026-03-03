import { useState, useEffect } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { TensionLevel, rawColors } from '../theme/colors';

// ============================================================
// Types
// ============================================================

type GuessStatus = 'waiting' | 'correct' | 'wrong';

interface ClueRow {
  id: number;
  clue: string;
  correctAnswer: number;
  guess: number | null;
  status: GuessStatus;
}

// ============================================================
// God's Eye View - Correct Answer Display
// ============================================================

function GodsEyeView({ answers }: { answers: number[] }) {
  return (
    <div
      className="mx-auto px-6 py-3 rounded-lg relative"
      style={{
        background: `${rawColors.crtScreenLight}`,
        border: `3px double ${rawColors.teamFriendly}`,
        boxShadow: `0 0 15px ${rawColors.teamFriendly}30, inset 0 0 10px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-sm">&#x1f510;</span>
        <span
          className="text-xs"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamFriendlyDim,
          }}
        >
          正确答案（仅你可见）
        </span>
      </div>
      <div className="flex items-center justify-center gap-3">
        {answers.map((num, i) => (
          <span key={i} className="flex items-center gap-3">
            <span
              className="text-2xl font-bold"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamFriendly,
                textShadow: `0 0 8px ${rawColors.teamFriendly}80`,
              }}
            >
              {num}
            </span>
            {i < answers.length - 1 && (
              <span
                className="text-sm"
                style={{ color: rawColors.teamFriendlyDim }}
              >
                →
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Clue Row Component
// ============================================================

function ClueRowItem({ row }: { row: ClueRow }) {
  const getStatusColor = () => {
    switch (row.status) {
      case 'correct':
        return rawColors.teamFriendly;
      case 'wrong':
        return rawColors.teamEnemy;
      default:
        return rawColors.teamFriendlyDim;
    }
  };

  const statusColor = getStatusColor();

  return (
    <div
      className="flex items-center gap-4 py-3 px-4 rounded-lg transition-[background,border-color] duration-300"
      style={{
        background:
          row.status === 'correct'
            ? `${rawColors.teamFriendly}08`
            : row.status === 'wrong'
              ? `${rawColors.teamEnemy}08`
              : 'transparent',
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      {/* Clue label and text */}
      <div className="flex-1">
        <span
          className="text-xs"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamFriendlyDim,
          }}
        >
          线索 {row.id}
        </span>
        <div
          className="text-lg"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.cream,
          }}
        >
          "{row.clue}"
        </div>
      </div>

      {/* Guess display */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamFriendlyDim,
          }}
        >
          猜：
        </span>

        {row.guess !== null ? (
          <span
            className="text-xl font-bold w-8 text-center"
            style={{
              fontFamily: "'VT323', monospace",
              color: statusColor,
              textShadow:
                row.status !== 'waiting'
                  ? `0 0 8px ${statusColor}60`
                  : 'none',
            }}
          >
            {row.guess}
          </span>
        ) : (
          <span
            className="text-xl w-8 text-center"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.teamFriendlyDim,
              animation: 'blink 1s step-end infinite',
            }}
          >
            ?
          </span>
        )}

        {/* Status icon */}
        {row.status === 'correct' && (
          <span
            className="text-lg"
            aria-label="正确"
            style={{
              color: rawColors.teamFriendly,
              textShadow: `0 0 8px ${rawColors.teamFriendly}`,
            }}
          >
            ✓
          </span>
        )}
        {row.status === 'wrong' && (
          <span className="flex items-center gap-1">
            <span
              className="text-lg"
              aria-label="错误"
              style={{
                color: rawColors.teamEnemy,
                textShadow: `0 0 8px ${rawColors.teamEnemy}`,
              }}
            >
              ✗
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamEnemyDim,
              }}
            >
              应为{row.correctAnswer}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Round Summary Modal
// ============================================================

function RoundSummary({
  clues,
  onContinue,
}: {
  clues: ClueRow[];
  onContinue: () => void;
}) {
  const correctCount = clues.filter((c) => c.status === 'correct').length;

  useEffect(() => {
    const timer = setTimeout(onContinue, 3000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onContinue();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="round-summary-title"
      style={{ background: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onContinue}
    >
      <div
        className="mx-4 p-6 rounded-lg max-w-sm w-full"
        style={{
          background: rawColors.bgDark,
          border: `2px solid ${rawColors.teamFriendlyDim}`,
          boxShadow: `0 0 30px rgba(0, 255, 136, 0.1)`,
          overscrollBehavior: 'contain',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="round-summary-title"
          className="text-center text-lg mb-4"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamFriendly,
          }}
        >
          ── 本轮解码结果 ──
        </div>

        <div className="space-y-2 mb-4">
          {clues.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 px-3 py-1 rounded"
              style={{
                fontFamily: "'VT323', monospace",
                color:
                  row.status === 'correct'
                    ? rawColors.teamFriendly
                    : rawColors.teamEnemy,
                background:
                  row.status === 'wrong'
                    ? `${rawColors.teamEnemy}10`
                    : 'transparent',
              }}
            >
              <span className="text-sm" style={{ color: rawColors.cream }}>
                "{row.clue}"
              </span>
              <span className="text-sm">→</span>
              <span className="font-bold">{row.guess}</span>
              <span>{row.status === 'correct' ? '✓' : '✗'}</span>
              {row.status === 'wrong' && (
                <span
                  className="text-xs"
                  style={{ color: rawColors.teamEnemyDim }}
                >
                  (应为{row.correctAnswer})
                </span>
              )}
            </div>
          ))}
        </div>

        <div
          className="text-center text-lg mb-3"
          style={{
            fontFamily: "'VT323', monospace",
            color:
              correctCount === 3
                ? rawColors.teamFriendly
                : rawColors.crtAmber,
          }}
        >
          得分：{correctCount} / 3
        </div>

        <button
          onClick={onContinue}
          className="w-full py-2 rounded-lg text-sm"
          style={{
            fontFamily: "'VT323', monospace",
            background: rawColors.crtScreenLight,
            border: `1px solid ${rawColors.teamFriendlyDim}`,
            color: rawColors.teamFriendly,
          }}
        >
          继续游戏
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Mascot Config
// ============================================================

const mascotConfig = {
  waiting: { emoji: '(;°Д°)', message: '不要猜错啊！' },
  correct: { emoji: '(＾▽＾)', message: '对了对了！' },
  wrong: { emoji: '(╥﹏╥)', message: '啊啊啊！' },
  allCorrect: { emoji: '\\(^o^)/', message: '太棒了！' },
  hasErrors: { emoji: '(;-_-)', message: '下次注意线索…' },
};

// ============================================================
// Main Page Component
// ============================================================

export default function EncryptorWatching() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showSummary, setShowSummary] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('waiting');

  // Mock data
  const correctAnswers = [3, 1, 4];
  const [clues, setClues] = useState<ClueRow[]>([
    { id: 1, clue: '苦涩', correctAnswer: 3, guess: null, status: 'waiting' },
    { id: 2, clue: '毛茸', correctAnswer: 1, guess: null, status: 'waiting' },
    { id: 3, clue: '开门', correctAnswer: 4, guess: null, status: 'waiting' },
  ]);

  // Calculate tension level
  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  // Countdown
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Simulate teammate guessing
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setClues((prev) =>
        prev.map((c) =>
          c.id === 1 ? { ...c, guess: 3, status: 'correct' as const } : c
        )
      );
      setMascotState('correct');
      setTimeout(() => setMascotState('waiting'), 2000);
    }, 4000);

    const timer2 = setTimeout(() => {
      setClues((prev) =>
        prev.map((c) =>
          c.id === 2 ? { ...c, guess: 2, status: 'wrong' as const } : c
        )
      );
      setMascotState('wrong');
      setTimeout(() => setMascotState('waiting'), 2000);
    }, 8000);

    const timer3 = setTimeout(() => {
      setClues((prev) =>
        prev.map((c) =>
          c.id === 3 ? { ...c, guess: 4, status: 'correct' as const } : c
        )
      );
      // Check final state
      setMascotState('hasErrors');
      setTimeout(() => setShowSummary(true), 1000);
    }, 12000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Get background color based on tension
  const getBgColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.tensionNormalBg;
      case 'warning':
        return rawColors.tensionWarningBg;
      case 'tense':
        return rawColors.tensionTenseBg;
      case 'critical':
        return rawColors.tensionCriticalBg;
      default:
        return rawColors.tensionNormalBg;
    }
  };

  const mascot = mascotConfig[mascotState];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)`,
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        {/* Top area: countdown */}
        <div className="flex flex-col items-center pt-6">
          <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Status text */}
        <div className="flex flex-col items-center mt-2">
          <span
            className="text-sm"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.teamFriendly,
            }}
          >
            队友正在解码<span style={{ animation: 'blink 1s step-end infinite' }}>…</span>
          </span>
        </div>

        {/* God's Eye View */}
        <div className="px-4 mt-4">
          <GodsEyeView answers={correctAnswers} />
        </div>

        {/* Divider */}
        <div
          className="mx-8 mt-4 border-t"
          style={{ borderColor: rawColors.teamFriendlyDim }}
        />

        {/* Real-time decode matching */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto" aria-live="polite">
          <div
            className="max-w-2xl mx-auto p-3 rounded-lg space-y-2"
            style={{
              background: rawColors.crtScreenLight,
              border: `1px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            {clues.map((row) => (
              <ClueRowItem key={row.id} row={row} />
            ))}
          </div>
        </div>

        {/* Bottom mascot area */}
        <div className="pb-4 px-4 mt-2">
          <div
            className="w-full max-w-md mx-auto p-4 rounded-lg"
            style={{
              background: rawColors.bgDark,
              border: `2px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            <div className="flex flex-col items-center justify-center" aria-live="polite">
              <div
                className="text-2xl"
                aria-hidden="true"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamFriendly,
                  textShadow: `0 0 8px ${rawColors.teamFriendly}60`,
                }}
              >
                {mascot.emoji}
              </div>
              <span
                className="text-sm mt-1"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamFriendly,
                }}
              >
                {mascot.message}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Round Summary Modal */}
      {showSummary && (
        <RoundSummary
          clues={clues}
          onContinue={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
