import { useState, useEffect } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { TensionLevel, rawColors } from '../theme/colors';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// Types
// ============================================================

interface IntelRow {
  round: number;
  clues: string[];
  sequence: string; // e.g. "② ④ ①" or "???"
  isCurrent: boolean;
}

// ============================================================
// Static Noise Border (reused from A3)
// ============================================================

function StaticNoiseBorder() {
  const [pattern, setPattern] = useState('');

  useEffect(() => {
    const generate = () => {
      const chars = ['▓', '░'];
      return Array.from({ length: 60 }, () => chars[Math.floor(Math.random() * 2)]).join('');
    };
    setPattern(generate());
    if (prefersReducedMotion) return;
    const timer = setInterval(() => setPattern(generate()), 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="w-full text-center select-none overflow-hidden whitespace-nowrap"
      style={{
        fontFamily: "'VT323', monospace",
        fontSize: '8px',
        lineHeight: '8px',
        color: rawColors.teamEnemyDim,
        opacity: 0.4,
      }}
    >
      {pattern}
    </div>
  );
}

// ============================================================
// Current Round Clues Display
// ============================================================

function CurrentClues({ clues }: { clues: string[] }) {
  return (
    <div
      className="px-4 py-3 rounded-lg"
      style={{
        background: '#2a0a0a',
        border: `2px solid ${rawColors.opponentNormalBorder}`,
      }}
    >
      <div
        className="text-xs mb-2"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemyDim,
        }}
      >
        本轮线索
      </div>
      <div className="flex items-center justify-center gap-3">
        {clues.map((clue, i) => (
          <span key={i} className="flex items-center gap-3">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamEnemy,
                textShadow: `0 0 6px rgba(255, 68, 68, 0.5)`,
              }}
            >
              "{clue}"
            </span>
            {i < clues.length - 1 && (
              <span
                className="text-sm"
                style={{ color: rawColors.teamEnemyDim }}
              >
                /
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Historical Intelligence Table
// ============================================================

function IntelTable({
  data,
  highlightedWord,
  onWordClick,
}: {
  data: IntelRow[];
  highlightedWord: string | null;
  onWordClick: (word: string) => void;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: rawColors.opponentCrtScreen,
        border: `1px solid ${rawColors.opponentNormalBorder}`,
      }}
    >
      {/* Header */}
      <div
        className="flex px-3 py-2 text-xs"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemyDim,
          borderBottom: `1px solid ${rawColors.opponentNormalBorder}`,
        }}
      >
        <span className="w-12">轮次</span>
        <span className="flex-1">线索词</span>
        <span className="w-24 text-right">已知顺序</span>
      </div>

      {/* Rows */}
      {data.map((row) => (
        <div
          key={row.round}
          className="flex px-3 py-2 items-center transition-[background,border-color] duration-300"
          style={{
            fontFamily: "'VT323', monospace",
            background: row.isCurrent
              ? `${rawColors.teamEnemy}10`
              : 'transparent',
            borderBottom: `1px solid ${rawColors.opponentNormalBorder}30`,
          }}
        >
          <span
            className="w-12 text-sm"
            style={{ color: rawColors.teamEnemyDim }}
          >
            R{row.round}
          </span>
          <span className="flex-1 flex items-center gap-1 flex-wrap">
            {row.clues.map((clue, i) => (
              <span key={i} className="flex items-center gap-1">
                <button
                  className="text-sm cursor-pointer px-1 rounded transition-colors duration-200"
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    border: 'none',
                    color:
                      highlightedWord === clue
                        ? rawColors.teamEnemy
                        : rawColors.cream,
                    background:
                      highlightedWord === clue
                        ? `${rawColors.teamEnemy}20`
                        : 'transparent',
                    textShadow:
                      highlightedWord === clue
                        ? `0 0 6px rgba(255, 68, 68, 0.6)`
                        : 'none',
                  }}
                  onClick={() => onWordClick(clue)}
                >
                  {clue}
                </button>
                {i < row.clues.length - 1 && (
                  <span
                    className="text-xs"
                    style={{ color: rawColors.teamEnemyDim }}
                  >
                    /
                  </span>
                )}
              </span>
            ))}
          </span>
          <span
            className="w-24 text-right text-sm"
            style={{
              color: row.isCurrent
                ? rawColors.teamEnemy
                : rawColors.teamEnemyDim,
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

// ============================================================
// Intercept Button (gradually brightens)
// ============================================================

function InterceptButton({
  elapsed,
  tension,
  onClick,
}: {
  elapsed: number;
  tension: TensionLevel;
  onClick: () => void;
}) {
  // Brightness increases from 0 to 1 over ~30 seconds
  const brightness = Math.min(elapsed / 30, 1);
  const isFullyLit = brightness >= 1;

  const opacity = 0.2 + brightness * 0.8;
  const glowIntensity = brightness * 15;
  const label =
    isFullyLit
      ? '◆ ⚡ 立即拦截 ⚡ ◆'
      : brightness > 0.5
        ? '◆ 准备拦截 ◆'
        : '◆ 准备拦截… ◆';

  return (
    <button
      className="w-full max-w-xs mx-auto block py-3 px-6 rounded-lg font-bold text-sm uppercase transition-[opacity,box-shadow] duration-500"
      style={{
        fontFamily: "'VT323', monospace",
        letterSpacing: '2px',
        background: `linear-gradient(180deg, ${rawColors.teamEnemyDim} 0%, ${rawColors.bgDark} 50%, ${rawColors.teamEnemyDim} 100%)`,
        border: `2px solid ${rawColors.teamEnemy}`,
        color: rawColors.teamEnemy,
        opacity,
        boxShadow: `0 0 ${glowIntensity}px rgba(255, 68, 68, ${brightness * 0.4})`,
        cursor: 'pointer',
        animation:
          isFullyLit && tension !== 'critical'
            ? 'breathe-red 2s ease-in-out infinite'
            : tension === 'critical'
              ? 'flash-red 0.5s ease-in-out infinite'
              : 'none',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ============================================================
// Mascot Config
// ============================================================

const mascotConfig = {
  analyzing: { emoji: '(•̀ᴗ•́)', message: '正在推理…' },
  comparing: { emoji: '(◎_◎)', message: '仔细对比中…' },
  progress: { emoji: '(｀∀´)', message: '有眉目了！' },
  ready: { emoji: '(｀∀´)Ψ', message: '出手时机到！' },
  pressure: { emoji: '(°_°)', message: '快决定！' },
  critical: { emoji: '(°Д°;)', message: '！！！' },
};

// ============================================================
// Main Page Component
// ============================================================

export default function OpponentAnalyzing() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [elapsed, setElapsed] = useState(0);
  const [highlightedWord, setHighlightedWord] = useState<string | null>(null);

  // Mock intel data
  const intelData: IntelRow[] = [
    { round: 1, clues: ['飞行', '自由', '羽毛'], sequence: '② ④ ①', isCurrent: false },
    { round: 2, clues: ['夜晚', '明亮', '银色'], sequence: '③ ① ②', isCurrent: false },
    { round: 3, clues: ['苦涩', '毛茸', '开门'], sequence: '???', isCurrent: true },
  ];

  const currentClues = ['苦涩', '毛茸', '开门'];

  // Tension
  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  // Countdown & elapsed
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
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Background
  const getBgColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.opponentNormalBg;
      case 'warning':
        return rawColors.opponentWarningBg;
      case 'tense':
        return rawColors.opponentTenseBg;
      case 'critical':
        return rawColors.opponentCriticalBg;
      default:
        return rawColors.opponentNormalBg;
    }
  };

  // Mascot state based on elapsed time and tension
  const getMascotState = (): keyof typeof mascotConfig => {
    if (tension === 'critical') return 'critical';
    if (tension === 'tense') return 'pressure';
    if (elapsed >= 30) return 'ready';
    if (elapsed >= 15) return 'progress';
    if (elapsed >= 5) return 'comparing';
    return 'analyzing';
  };

  const handleWordClick = (word: string) => {
    setHighlightedWord((prev) => (prev === word ? null : word));
  };

  const handleIntercept = () => {
    // Placeholder - would navigate to C2 intercept input
    alert('拦截！（将跳转到拦截输入页面）');
  };

  const mascot = mascotConfig[getMascotState()];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0505 100%)`,
      }}
    >
      {/* Critical pulsing overlay */}
      {tension === 'critical' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: 'rgba(255, 0, 0, 0.05)',
            animation: 'pulse-red 1s ease-in-out infinite',
          }}
        />
      )}

      <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes breathe-red {
          0%, 100% { box-shadow: 0 0 10px rgba(255, 68, 68, 0.3); }
          50% { box-shadow: 0 0 25px rgba(255, 68, 68, 0.6); }
        }
        @keyframes flash-red {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="relative z-10 h-full flex flex-col">
        {/* Top noise border */}
        <StaticNoiseBorder />

        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        {/* Title */}
        <div
          className="text-center mt-2 text-sm"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamEnemy,
            textShadow: `0 0 8px rgba(255, 68, 68, 0.5)`,
          }}
        >
          <span aria-hidden="true">⚡</span> 情报分析 <span aria-hidden="true">⚡</span>
        </div>

        {/* Main content area */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto">
          <div
            className="max-w-2xl mx-auto p-4 rounded-lg"
            style={{
              background: rawColors.opponentScreenBg,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: `inset 0 0 30px rgba(0, 0, 0, 0.8)`,
            }}
          >
            <StaticNoiseBorder />

            {/* Current round clues */}
            <div className="mt-3">
              <CurrentClues clues={currentClues} />
            </div>

            {/* Divider */}
            <div
              className="my-3 border-t"
              style={{ borderColor: rawColors.opponentNormalBorder }}
            />

            {/* Historical intelligence */}
            <div className="mb-2">
              <div
                className="text-xs mb-2"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamEnemyDim,
                }}
              >
                历史情报
              </div>
              <IntelTable
                data={intelData}
                highlightedWord={highlightedWord}
                onWordClick={handleWordClick}
              />
            </div>

            <StaticNoiseBorder />
          </div>
        </div>

        {/* Intercept button area */}
        <div className="px-4 py-3 flex flex-col items-center gap-1">
          <InterceptButton
            elapsed={elapsed}
            tension={tension}
            onClick={handleIntercept}
          />
          <button
            className="text-xs cursor-pointer"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.metalLight,
              background: 'none',
              border: 'none',
              padding: 0,
            }}
          >
            跳过本轮
          </button>
        </div>

        {/* Mascot area */}
        <div className="pb-4 px-4">
          <div
            className="w-full max-w-md mx-auto p-3 rounded-lg relative"
            style={{
              background: rawColors.opponentCrtScreen,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: `inset 0 0 20px rgba(0, 0, 0, 0.6)`,
            }}
          >
            <StaticNoiseBorder />
            <div className="flex flex-col items-center justify-center py-2" aria-live="polite">
              <div
                className="text-2xl"
                aria-hidden="true"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamEnemy,
                  textShadow: `0 0 8px rgba(255, 68, 68, 0.6)`,
                }}
              >
                {mascot.emoji}
              </div>
              <span
                className="text-sm mt-1"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamEnemy,
                  textShadow: `0 0 4px rgba(255, 68, 68, 0.4)`,
                }}
              >
                {mascot.message}
              </span>
            </div>
            <StaticNoiseBorder />
          </div>
        </div>

        {/* Bottom noise border */}
        <StaticNoiseBorder />
      </div>
    </div>
  );
}
