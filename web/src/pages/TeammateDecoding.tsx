import { useState, useEffect, useCallback } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import {
  DeskClockTimer, BrassTokenPad, DossierButton,
  AgentPanel, DossierEffectLayer,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';

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
  correctAnswer: number;
}

// Codeword reference card (pinned with thumbtack)
function CodeWordCard({ codeword, isHighlighted }: { codeword: CodeWord; isHighlighted: boolean }) {
  return (
    <div
      className="flex flex-col items-center p-2 lg:p-3 rounded transition-[background,border-color,box-shadow] duration-300 relative"
      style={{
        background: isHighlighted ? `${rawColors.teamFriendly}15` : rawColors.bgPaper,
        border: `2px solid ${isHighlighted ? rawColors.teamFriendly : rawColors.creamDark}`,
        boxShadow: isHighlighted ? `0 0 10px ${rawColors.teamFriendly}30` : '2px 2px 4px rgba(0,0,0,0.2)',
        minWidth: '60px',
        color: rawColors.inkBlack,
      }}
    >
      {/* Thumbtack */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 35%, ${rawColors.intelRed}, ${rawColors.intelRedDim})`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      />

      <span
        className="text-xl lg:text-2xl font-bold mt-1"
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          color: isHighlighted ? rawColors.teamFriendly : rawColors.brass,
        }}
      >
        {codeword.number}
      </span>
      <span
        className="text-sm lg:text-base mt-1"
        style={{ fontFamily: "'Noto Serif SC', serif", color: rawColors.inkBlack }}
      >
        {codeword.word}
      </span>
    </div>
  );
}

// Answer slot with typewriter line
function AnswerSlot({ slot, isFocused, onClick }: { slot: ClueSlot; isFocused: boolean; onClick: () => void }) {
  const getBorderColor = () => {
    if (slot.status === 'correct') return rawColors.teamFriendly;
    if (slot.status === 'wrong') return rawColors.intelRed;
    if (isFocused) return rawColors.brass;
    if (slot.answer !== null) return rawColors.teamFriendly;
    return rawColors.brassDim;
  };

  const borderColor = getBorderColor();

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 rounded cursor-pointer transition-[background,border-color] duration-200"
      style={{
        background: slot.status === 'correct' ? `${rawColors.teamFriendly}08`
          : slot.status === 'wrong' ? `${rawColors.intelRed}08`
          : isFocused ? `${rawColors.brass}08`
          : 'transparent',
        borderLeft: `3px solid ${borderColor}`,
      }}
      onClick={onClick}
    >
      <div className="flex-1">
        <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          线索 {slot.id}
        </span>
        <div className="text-lg" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.cream }}>
          "{slot.clue}"
        </div>
      </div>

      <span className="text-sm" style={{ color: rawColors.brassDim }}>→</span>

      {/* Answer box */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center"
        style={{
          background: rawColors.navyDark,
          border: `2px solid ${borderColor}`,
          boxShadow: isFocused ? `0 0 10px ${rawColors.brass}40` : 'none',
        }}
      >
        {slot.answer !== null ? (
          <span
            className="text-xl font-bold"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              color: slot.status === 'wrong' ? rawColors.intelRed : rawColors.teamFriendly,
            }}
          >
            {slot.answer}
          </span>
        ) : (
          <span
            className="text-xl"
            style={{
              fontFamily: "'Courier Prime', monospace",
              color: rawColors.brassDim,
              animation: isFocused ? 'blink 1s step-end infinite' : 'none',
            }}
          >
            ?
          </span>
        )}
      </div>

      {/* Status */}
      {slot.status === 'correct' && <span className="text-lg" style={{ color: rawColors.teamFriendly }}>✓</span>}
      {slot.status === 'wrong' && (
        <span className="flex items-center gap-1">
          <span className="text-lg" style={{ color: rawColors.intelRed }}>✗</span>
          <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.intelRedDim }}>
            应为{slot.correctAnswer}
          </span>
        </span>
      )}
    </div>
  );
}

const mascotConfig = {
  thinking: { emoji: '🤔', message: '认真分析中…' },
  hasIdea: { emoji: '💡', message: '有思路了…' },
  almostDone: { emoji: '📝', message: '感觉对了！' },
  waitingResult: { emoji: '⏳', message: '等待判定…' },
  correct: { emoji: '🎖️', message: '解码成功！' },
  wrong: { emoji: '❌', message: '猜错了…' },
};

export default function TeammateDecoding() {
  const { myWords, clues, submitDecrypt } = useGameStore();

  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [focusedSlot, setFocusedSlot] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [mascotState, setMascotState] = useState<keyof typeof mascotConfig>('thinking');

  const codewords: CodeWord[] = myWords.map((word, i) => ({ number: i + 1, word }));

  const [slots, setSlots] = useState<ClueSlot[]>(() =>
    clues.map((clue, i) => ({
      id: i + 1, clue, answer: null, status: 'empty' as SlotStatus, correctAnswer: 0,
    }))
  );

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
    if (filledCount === 0) setMascotState('thinking');
    else if (filledCount === 1) setMascotState('hasIdea');
    else if (filledCount >= 2) setMascotState('almostDone');
  }, [slots, submitted]);

  const handleNumberSelect = useCallback((num: number) => {
    if (submitted) return;
    setSlots((prev) => {
      const newSlots = prev.map((s) =>
        s.id === focusedSlot ? { ...s, answer: num, status: 'filled' as const } : s
      );
      const nextEmpty = newSlots.find((s) => s.answer === null);
      if (nextEmpty) setFocusedSlot(nextEmpty.id);
      return newSlots;
    });
  }, [focusedSlot, submitted]);

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
    setMascotState('waitingResult');
    const guess = slots.map((s) => s.answer!) as [number, number, number];
    submitDecrypt(guess);
  };

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.tensionNormalBg;
      case 'warning': return rawColors.tensionWarningBg;
      case 'tense': return rawColors.tensionTenseBg;
      case 'critical': return rawColors.tensionCriticalBg;
    }
  };

  const highlightedNumbers = slots.filter((s) => s.answer !== null).map((s) => s.answer as number);
  const mascot = mascotConfig[mascotState];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Corkboard reference */}
        <div className="px-4 mt-3">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{
              background: rawColors.navyLight,
              border: `2px solid ${rawColors.brassDim}`,
            }}
          >
            <div className="text-center text-xs mb-3" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
              密语参照表
            </div>
            <div className="flex justify-center gap-3 lg:gap-5">
              {codewords.map((cw) => (
                <CodeWordCard key={cw.number} codeword={cw} isHighlighted={highlightedNumbers.includes(cw.number)} />
              ))}
            </div>
          </div>
        </div>

        {/* Clue answer area */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{ background: rawColors.navyLight, border: `1px solid ${rawColors.brassDim}` }}
          >
            <div className="text-center text-xs mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
              本轮线索
            </div>
            <div className="space-y-2">
              {slots.map((slot) => (
                <AnswerSlot key={slot.id} slot={slot} isFocused={focusedSlot === slot.id && !submitted} onClick={() => handleSlotClick(slot.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Brass token pad & submit */}
        {!submitted && (
          <div className="px-4 py-3 flex flex-col items-center gap-3">
            <BrassTokenPad
              onNumberSelect={handleNumberSelect}
              selectedNumbers={usedNumbers}
              tension={tension}
              size="medium"
            />
            {allFilled && (
              <DossierButton variant="stamp" team="friendly" size="medium" onClick={handleSubmit}>
                提交解码
              </DossierButton>
            )}
          </div>
        )}

        {/* Submitted waiting */}
        {submitted && mascotState === 'waitingResult' && (
          <div className="text-center py-3" style={{ fontFamily: "'Special Elite', cursive", color: rawColors.brass }}>
            ════ 等待判定… ════
          </div>
        )}

        {/* Bottom agent */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="friendly" />
        </div>
      </div>
    </div>
  );
}
