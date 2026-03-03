import { useState, useEffect, useCallback } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { NumberPad } from '../components/ui/NumberPad';
import { CRTButton } from '../components/ui/CRTButton';
import { TensionLevel, rawColors } from '../theme/colors';

// ============================================================
// Types
// ============================================================

type SlotStatus = 'empty' | 'focused' | 'filled' | 'correct' | 'wrong';

interface CodeWord {
  number: number;
  word: string;
}

interface ClueSlot {
  id: number;
  clue: string;
  answer: number | null;
  status: SlotStatus;
  correctAnswer: number; // hidden, used after submit
}

// ============================================================
// Codeword Card Component
// ============================================================

function CodeWordCard({
  codeword,
  isHighlighted,
}: {
  codeword: CodeWord;
  isHighlighted: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center p-2 lg:p-3 rounded-lg transition-[background,border-color,box-shadow] duration-300"
      style={{
        background: isHighlighted
          ? `${rawColors.teamFriendly}15`
          : rawColors.crtScreenLight,
        border: `2px solid ${isHighlighted ? rawColors.teamFriendly : rawColors.teamFriendlyDim}`,
        boxShadow: isHighlighted
          ? `0 0 10px ${rawColors.teamFriendly}30`
          : 'none',
        minWidth: '60px',
      }}
    >
      <span
        className="text-xl lg:text-2xl font-bold"
        style={{
          fontFamily: "'VT323', monospace",
          color: isHighlighted
            ? rawColors.teamFriendly
            : rawColors.crtPhosphor,
          textShadow: isHighlighted
            ? `0 0 8px ${rawColors.teamFriendly}60`
            : 'none',
        }}
      >
        {codeword.number}
      </span>
      <span
        className="text-sm lg:text-base mt-1"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.cream,
        }}
      >
        {codeword.word}
      </span>
    </div>
  );
}

// ============================================================
// Answer Slot Component
// ============================================================

function AnswerSlot({
  slot,
  isFocused,
  onClick,
}: {
  slot: ClueSlot;
  isFocused: boolean;
  onClick: () => void;
}) {
  const getBorderColor = () => {
    if (slot.status === 'correct') return rawColors.teamFriendly;
    if (slot.status === 'wrong') return rawColors.teamEnemy;
    if (isFocused) return rawColors.teamFriendly;
    if (slot.answer !== null) return rawColors.teamFriendly;
    return rawColors.teamFriendlyDim;
  };

  const borderColor = getBorderColor();

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 rounded-lg cursor-pointer transition-[background,border-color] duration-200"
      style={{
        background:
          slot.status === 'correct'
            ? `${rawColors.teamFriendly}08`
            : slot.status === 'wrong'
              ? `${rawColors.teamEnemy}08`
              : isFocused
                ? `${rawColors.teamFriendly}05`
                : 'transparent',
        borderLeft: `3px solid ${borderColor}`,
      }}
      onClick={onClick}
    >
      {/* Clue */}
      <div className="flex-1">
        <span
          className="text-xs"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.teamFriendlyDim,
          }}
        >
          线索 {slot.id}
        </span>
        <div
          className="text-lg"
          style={{
            fontFamily: "'VT323', monospace",
            color: rawColors.cream,
          }}
        >
          "{slot.clue}"
        </div>
      </div>

      {/* Arrow */}
      <span
        className="text-sm"
        style={{ color: rawColors.teamFriendlyDim }}
      >
        →
      </span>

      {/* Answer box */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center"
        style={{
          background: rawColors.crtScreen,
          border: `2px solid ${borderColor}`,
          boxShadow: isFocused
            ? `0 0 10px ${rawColors.teamFriendly}40`
            : 'none',
        }}
      >
        {slot.answer !== null ? (
          <span
            className="text-xl font-bold"
            style={{
              fontFamily: "'VT323', monospace",
              color:
                slot.status === 'wrong'
                  ? rawColors.teamEnemy
                  : rawColors.teamFriendly,
              textShadow: `0 0 6px ${slot.status === 'wrong' ? rawColors.teamEnemy : rawColors.teamFriendly}60`,
            }}
          >
            {slot.answer}
          </span>
        ) : (
          <span
            className="text-xl"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.teamFriendlyDim,
              animation: isFocused ? 'blink 1s step-end infinite' : 'none',
            }}
          >
            ?
          </span>
        )}
      </div>

      {/* Status icon */}
      {slot.status === 'correct' && (
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
      {slot.status === 'wrong' && (
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
            应为{slot.correctAnswer}
          </span>
        </span>
      )}
    </div>
  );
}

// ============================================================
// Mascot Config
// ============================================================

const mascotConfig = {
  thinking: { emoji: '(◎_◎)', message: '认真分析中…' },
  hasIdea: { emoji: '(•‿•)', message: '有思路了…' },
  almostDone: { emoji: '(＾▽＾)', message: '感觉对了！' },
  waitingResult: { emoji: '(・_・)', message: '等待判定…' },
  correct: { emoji: '\\(^o^)/', message: '解码成功！' },
  wrong: { emoji: '(╥﹏╥)', message: '猜错了…' },
};

// ============================================================
// Main Page Component
// ============================================================

export default function TeammateDecoding() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [focusedSlot, setFocusedSlot] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('thinking');

  // Mock codewords
  const codewords: CodeWord[] = [
    { number: 1, word: '猫咪' },
    { number: 2, word: '月亮' },
    { number: 3, word: '咖啡' },
    { number: 4, word: '钥匙' },
  ];

  const [slots, setSlots] = useState<ClueSlot[]>([
    { id: 1, clue: '苦涩', answer: null, status: 'empty', correctAnswer: 3 },
    { id: 2, clue: '毛茸', answer: null, status: 'empty', correctAnswer: 1 },
    { id: 3, clue: '开门', answer: null, status: 'empty', correctAnswer: 4 },
  ]);

  // Tension
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

  // Keyboard support
  useEffect(() => {
    if (submitted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4) {
        handleNumberSelect(num);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Determine which numbers are currently used in slots
  const usedNumbers = slots.map((s) => s.answer).filter((a): a is number => a !== null);
  const allFilled = slots.every((s) => s.answer !== null);

  // Update mascot based on progress
  useEffect(() => {
    if (submitted) return;
    const filledCount = slots.filter((s) => s.answer !== null).length;
    if (filledCount === 0) setMascotState('thinking');
    else if (filledCount === 1) setMascotState('hasIdea');
    else if (filledCount >= 2) setMascotState('almostDone');
  }, [slots, submitted]);

  const handleNumberSelect = useCallback(
    (num: number) => {
      if (submitted) return;

      setSlots((prev) => {
        const newSlots = prev.map((s) =>
          s.id === focusedSlot ? { ...s, answer: num, status: 'filled' as const } : s
        );

        // Auto-advance to next empty slot
        const nextEmpty = newSlots.find((s) => s.answer === null);
        if (nextEmpty) {
          setFocusedSlot(nextEmpty.id);
        }

        return newSlots;
      });
    },
    [focusedSlot, submitted]
  );

  const handleSlotClick = (slotId: number) => {
    if (submitted) return;
    const slot = slots.find((s) => s.id === slotId);
    if (slot?.answer !== null) {
      // Clear this slot
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId ? { ...s, answer: null, status: 'empty' as const } : s
        )
      );
    }
    setFocusedSlot(slotId);
  };

  const handleSubmit = () => {
    if (!allFilled || submitted) return;
    setSubmitted(true);
    setMascotState('waitingResult');

    // Simulate result reveal with staggered timing
    setTimeout(() => {
      setSlots((prev) =>
        prev.map((s) => ({
          ...s,
          status: (s.answer === s.correctAnswer ? 'correct' : 'wrong') as SlotStatus,
        }))
      );

      const allCorrect = slots.every((s) => s.answer === s.correctAnswer);
      setMascotState(allCorrect ? 'correct' : 'wrong');
    }, 1500);
  };

  // Get background
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

  // Which codeword cards are highlighted (their number is in a slot)
  const highlightedNumbers = slots
    .filter((s) => s.answer !== null)
    .map((s) => s.answer as number);

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
        <div className="flex flex-col items-center pt-4">
          <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Codeword Reference Table */}
        <div className="px-4 mt-3">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{
              background: rawColors.crtScreenLight,
              border: `2px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            <div
              className="text-center text-xs mb-2"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamFriendlyDim,
              }}
            >
              密语参照表
            </div>
            <div className="flex justify-center gap-2 lg:gap-4">
              {codewords.map((cw) => (
                <CodeWordCard
                  key={cw.number}
                  codeword={cw}
                  isHighlighted={highlightedNumbers.includes(cw.number)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Clue Answer Area */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{
              background: rawColors.crtScreenLight,
              border: `1px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            <div
              className="text-center text-xs mb-2"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamFriendlyDim,
              }}
            >
              本轮线索
            </div>
            <div className="space-y-2">
              {slots.map((slot) => (
                <AnswerSlot
                  key={slot.id}
                  slot={slot}
                  isFocused={focusedSlot === slot.id && !submitted}
                  onClick={() => handleSlotClick(slot.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Number Pad & Submit */}
        {!submitted && (
          <div className="px-4 py-3 flex flex-col items-center gap-3">
            <NumberPad
              onNumberSelect={handleNumberSelect}
              selectedNumbers={usedNumbers}
              tension={tension}
              size="medium"
            />

            {allFilled && (
              <CRTButton
                team="friendly"
                variant="secondary"
                size="medium"
                fullWidth={false}
                onClick={handleSubmit}
              >
                <span aria-hidden="true">◆</span> 提交解码 <span aria-hidden="true">◆</span>
              </CRTButton>
            )}
          </div>
        )}

        {/* Submitted waiting indicator */}
        {submitted && mascotState === 'waitingResult' && (
          <div
            className="text-center py-3"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.crtAmber,
            }}
          >
            <span aria-hidden="true">════</span> 等待判定… <span aria-hidden="true">════</span>
          </div>
        )}

        {/* Bottom mascot area */}
        <div className="pb-4 px-4">
          <div
            className="w-full max-w-md mx-auto p-3 rounded-lg"
            style={{
              background: rawColors.bgDark,
              border: `2px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            <div className="flex flex-col items-center justify-center" aria-live="assertive">
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
    </div>
  );
}
