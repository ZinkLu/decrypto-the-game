import { useState, useEffect, useCallback, useMemo } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import { DeskClockTimer, AgentPanel, DossierEffectLayer } from '../components/dossier';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

type SlotStatus = 'empty' | 'focused' | 'filled';

interface InterceptSlotData {
  id: number;
  clue: string;
  answer: number | null;
  status: SlotStatus;
}

interface IntelRow {
  round: number;
  clues: string[];
  sequence: string;
}

// Intercepted clues display (reuses B3 CurrentClues style)
function InterceptedClues({ clues }: { clues: string[] }) {
  return (
    <div
      className="px-4 py-3 rounded-lg"
      style={{ background: `${rawColors.teamEnemy}10`, border: `2px solid ${rawColors.opponentNormalBorder}` }}
    >
      <div className="text-xs mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
        Intercepted Clues
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

// Collapsible intel summary
function IntelSummary({ data }: { data: IntelRow[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        className="text-xs cursor-pointer flex items-center gap-1 w-full"
        style={{
          fontFamily: "'Courier Prime', monospace",
          color: rawColors.teamEnemyDim,
          background: 'none',
          border: 'none',
          padding: '4px 0',
        }}
        onClick={() => setExpanded((p) => !p)}
      >
        Intel Summary [{expanded ? 'CLOSE ▼' : 'EXPAND ▶'}]
      </button>

      {expanded && (
        <div
          className="rounded-lg overflow-hidden max-h-40 overflow-y-auto mt-1"
          style={{ background: rawColors.opponentCrtScreen, border: `1px solid ${rawColors.opponentNormalBorder}` }}
        >
          {/* Header */}
          <div
            className="flex px-3 py-1.5 text-xs"
            style={{
              fontFamily: "'Courier Prime', monospace",
              color: rawColors.teamEnemyDim,
              borderBottom: `1px solid ${rawColors.opponentNormalBorder}`,
            }}
          >
            <span className="w-10">RND</span>
            <span className="flex-1">Clues</span>
            <span className="w-20 text-right">Known Order</span>
          </div>

          {data.map((row) => (
            <div
              key={row.round}
              className="flex px-3 py-1.5 items-center"
              style={{
                fontFamily: "'Courier Prime', monospace",
                borderBottom: `1px solid ${rawColors.opponentNormalBorder}30`,
              }}
            >
              <span className="w-10 text-xs" style={{ color: rawColors.teamEnemyDim }}>R{row.round}</span>
              <span className="flex-1 text-sm" style={{ color: rawColors.cream }}>
                {row.clues.join(' / ')}
              </span>
              <span className="w-20 text-right text-sm" style={{ color: rawColors.teamEnemyDim }}>
                {row.sequence}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Single intercept answer slot
function InterceptSlot({
  slot,
  clue,
  isFocused,
  onClick,
}: {
  slot: InterceptSlotData;
  clue: string;
  isFocused: boolean;
  onClick: () => void;
}) {
  const getBorderColor = () => {
    if (slot.answer !== null) return rawColors.teamEnemyLight;
    if (isFocused) return rawColors.teamEnemy;
    return rawColors.opponentNormalBorder;
  };

  const borderColor = getBorderColor();

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 rounded cursor-pointer transition-[background,border-color] duration-200"
      style={{
        background: isFocused ? `${rawColors.teamEnemy}08` : 'transparent',
        borderLeft: `3px solid ${borderColor}`,
      }}
      onClick={onClick}
    >
      <div className="flex-1">
        <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
          Clue {slot.id}
        </span>
        <div className="text-lg" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}>
          "{clue}"
        </div>
      </div>

      <span className="text-sm" style={{ color: rawColors.opponentNormalBorder }}>→</span>

      {/* Answer box */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center"
        style={{
          background: rawColors.opponentCrtScreen,
          border: `2px solid ${borderColor}`,
          boxShadow: isFocused ? `0 0 10px ${rawColors.teamEnemy}40` : 'none',
        }}
      >
        {slot.answer !== null ? (
          <span
            className="text-xl font-bold"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemyLight }}
          >
            {slot.answer}
          </span>
        ) : (
          <span
            className="text-xl"
            style={{
              fontFamily: "'Courier Prime', monospace",
              color: rawColors.teamEnemyDim,
              animation: isFocused ? 'blink 1s step-end infinite' : 'none',
            }}
          >
            ?
          </span>
        )}
      </div>
    </div>
  );
}

// Red token pad (enemy variant of BrassTokenPad)
function RedTokenPad({
  onNumberSelect,
  selectedNumbers = [],
  size = 'medium',
}: {
  onNumberSelect: (num: number) => void;
  selectedNumbers?: number[];
  size?: 'small' | 'medium' | 'large';
}) {
  const sizeConfig = {
    small: { buttonSize: '40px', fontSize: '1.25rem', gap: '8px' },
    medium: { buttonSize: '56px', fontSize: '1.5rem', gap: '12px' },
    large: { buttonSize: '72px', fontSize: '2rem', gap: '16px' },
  };

  const config = sizeConfig[size];
  const numbers = [1, 2, 3, 4];

  return (
    <div className="flex" style={{ gap: config.gap }}>
      {numbers.map((num) => {
        const isSelected = selectedNumbers.includes(num);
        const isAvailable = !isSelected;

        return (
          <motion.button
            key={num}
            aria-label={`Select number ${num}`}
            className="relative rounded-full font-bold"
            style={{
              width: config.buttonSize,
              height: config.buttonSize,
              fontSize: config.fontSize,
              fontFamily: "'Bebas Neue', sans-serif",
              background: isSelected
                ? `radial-gradient(circle at 35% 35%, ${rawColors.teamEnemyDim}, ${rawColors.opponentNormalBorder})`
                : `linear-gradient(180deg, ${rawColors.teamEnemyLight} 0%, ${rawColors.teamEnemy} 50%, ${rawColors.teamEnemyDim} 100%)`,
              color: rawColors.cream,
              border: `2px solid ${rawColors.teamEnemy}`,
              boxShadow: isSelected
                ? 'none'
                : 'inset 0 2px 4px rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.4)',
              cursor: isAvailable ? 'pointer' : 'not-allowed',
              opacity: isSelected ? 0.4 : 1,
            }}
            whileHover={isAvailable ? { scale: 1.08, boxShadow: `0 0 8px rgba(139, 0, 0, 0.4)` } : {}}
            whileTap={isAvailable ? { scale: 0.92 } : {}}
            onClick={() => isAvailable && onNumberSelect(num)}
            disabled={!isAvailable}
          >
            {num}
          </motion.button>
        );
      })}
    </div>
  );
}

const mascotConfig = {
  targeting: { emoji: '🎯', message: 'Locking target...' },
  hasIdea: { emoji: '💡', message: 'Confident...' },
  ready: { emoji: '🔥', message: 'Ready to strike!' },
  waiting: { emoji: '⏳', message: 'Awaiting result...' },
};

export default function OpponentIntercepting() {
  const { clues: currentClues, history: gameHistory, submitIntercept, sendProgress } = useGameStore();

  const [timeLeft, setTimeLeft] = useState(45);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [focusedSlot, setFocusedSlot] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('targeting');

  const circledDigits = ['①', '②', '③', '④'];
  const intelData: IntelRow[] = useMemo(() =>
    gameHistory
      .filter((row) => row.clues.length > 0)
      .map((row) => ({
        round: row.round,
        clues: row.clues,
        sequence: row.secret
          ? row.secret.map((n) => circledDigits[n - 1] || String(n)).join(' ')
          : '???',
      })),
    [gameHistory],
  );

  const [slots, setSlots] = useState<InterceptSlotData[]>(() =>
    currentClues.map((clue, i) => ({
      id: i + 1, clue, answer: null, status: 'empty' as SlotStatus,
    }))
  );

  useEffect(() => {
    if (timeLeft > 15) setTension('normal');
    else if (timeLeft > 8) setTension('warning');
    else if (timeLeft > 3) setTension('tense');
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

  // Keyboard shortcut
  useEffect(() => {
    if (submitted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4) handleNumberSelect(num);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const usedNumbers = slots.map((s) => s.answer).filter((a): a is number => a !== null);
  const allFilled = slots.every((s) => s.answer !== null);

  useEffect(() => {
    if (submitted) return;
    const filledCount = slots.filter((s) => s.answer !== null).length;
    if (filledCount === 0) setMascotState('targeting');
    else if (filledCount === 1) setMascotState('hasIdea');
    else if (filledCount >= 2) setMascotState('ready');
  }, [slots, submitted]);

  const handleNumberSelect = useCallback((num: number) => {
    if (submitted) return;
    sendProgress('intercept', focusedSlot);
    setSlots((prev) => {
      const newSlots = prev.map((s) =>
        s.id === focusedSlot ? { ...s, answer: num, status: 'filled' as const } : s
      );
      const nextEmpty = newSlots.find((s) => s.answer === null);
      if (nextEmpty) setFocusedSlot(nextEmpty.id);
      return newSlots;
    });
  }, [focusedSlot, submitted, sendProgress]);

  const handleSlotClick = (slotId: number) => {
    if (submitted) return;
    const slot = slots.find((s) => s.id === slotId);
    if (slot?.answer !== null) {
      setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, answer: null, status: 'empty' as const } : s));
    }
    setFocusedSlot(slotId);
  };

  const handleSubmit = () => {
    if (!allFilled || submitted) return;
    setSubmitted(true);
    setMascotState('waiting');
    const guess = slots.map((s) => s.answer!) as [number, number, number];
    submitIntercept(guess);
  };

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.opponentNormalBg;
      case 'warning': return rawColors.opponentWarningBg;
      case 'tense': return rawColors.opponentTenseBg;
      case 'critical': return rawColors.opponentCriticalBg;
    }
  };

  const mascot = mascotConfig[mascotState];

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

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        {/* Title */}
        <div
          className="text-center mt-2 text-sm"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemy, letterSpacing: '4px' }}
        >
          INTERCEPT OPERATION
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
            {/* Intercepted clues */}
            <InterceptedClues clues={currentClues} />

            {/* Divider */}
            <div className="my-3 border-t" style={{ borderColor: rawColors.opponentNormalBorder }} />

            {/* Intel summary (collapsible) */}
            <IntelSummary data={intelData} />
          </div>

          {/* Intercept input area */}
          <div
            className="max-w-2xl mx-auto mt-3 p-3 rounded-lg"
            style={{ background: rawColors.navyDark, border: `1px solid ${rawColors.opponentNormalBorder}` }}
          >
            <div className="text-center text-xs mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
              ENTER INTERCEPT CODE
            </div>
            <div className="space-y-2">
              {slots.map((slot) => (
                <InterceptSlot
                  key={slot.id}
                  slot={slot}
                  clue={slot.clue}
                  isFocused={focusedSlot === slot.id && !submitted}
                  onClick={() => handleSlotClick(slot.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Red token pad & confirm */}
        {!submitted && (
          <div className="px-4 py-3 flex flex-col items-center gap-3">
            <RedTokenPad
              onNumberSelect={handleNumberSelect}
              selectedNumbers={usedNumbers}
              size="medium"
            />
            {allFilled && (
              <button
                className="py-3 px-6 rounded-lg font-bold text-sm uppercase cursor-pointer"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '3px',
                  background: `linear-gradient(180deg, ${rawColors.teamEnemyLight} 0%, ${rawColors.teamEnemy} 50%, ${rawColors.teamEnemyDim} 100%)`,
                  border: `2px solid ${rawColors.teamEnemy}`,
                  color: rawColors.cream,
                  boxShadow: `0 0 15px rgba(139, 0, 0, 0.4)`,
                  animation: 'breathe-red 2s ease-in-out infinite',
                }}
                onClick={handleSubmit}
              >
                ☎ CONFIRM INTERCEPT
              </button>
            )}
          </div>
        )}

        {/* Submitted waiting state */}
        {submitted && (
          <div className="text-center py-4 flex flex-col items-center gap-2">
            <span style={{ fontFamily: "'Special Elite', cursive", color: rawColors.teamEnemy }}>
              ════ Intercept order sent... ════
            </span>
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{
                background: rawColors.teamEnemy,
                animation: 'pulse-red 1.5s ease-in-out infinite',
              }}
            />
          </div>
        )}

        {/* Bottom agent */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="enemy" />
        </div>
      </div>
    </div>
  );
}
