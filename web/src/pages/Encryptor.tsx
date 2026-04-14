import { useState, useEffect, useMemo } from 'react';
import { TensionLevel, encryptorTensionConfig, rawColors } from '../theme/colors';
import {
  TypewriterInput, DeskClockTimer, DossierButton,
  AgentPanel, RubberStamp, DossierEffectLayer, PaperCard,
} from '../components/dossier';
import { useGameStore } from '../store/gameStore';

interface CodeWord { number: number; word: string; }
interface ClueSlot { id: number; digit: number; word: string; clue: string; }
interface HistoryEntry {
  round: number;
  entries: { number: number; word: string; clue: string }[];
}

function CodeWordCard({ codeword, isHighlighted }: { codeword: CodeWord; isHighlighted: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-2 lg:p-3 rounded transition-[border-color,box-shadow] duration-300 relative shrink-0"
      style={{
        background: rawColors.bgPaper,
        border: `2px solid ${isHighlighted ? rawColors.teamFriendly : rawColors.creamDark}`,
        boxShadow: isHighlighted
          ? `0 0 0 2px ${rawColors.teamFriendly}40, 0 0 12px ${rawColors.teamFriendly}60`
          : '2px 2px 4px rgba(0,0,0,0.2)',
        width: '72px',
        color: rawColors.inkBlack,
      }}
    >
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

function ClueInputSlot({
  slot, isFocused, disabled, onFocus, onChange,
}: {
  slot: ClueSlot;
  isFocused: boolean;
  disabled: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  const filled = slot.clue.trim() !== '';
  const borderColor = filled
    ? rawColors.teamFriendly
    : isFocused ? rawColors.brass : rawColors.brassDim;

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded cursor-text transition-[background,border-color] duration-200"
      style={{
        background: filled
          ? `${rawColors.teamFriendly}08`
          : isFocused ? `${rawColors.brass}08` : 'transparent',
        borderLeft: `3px solid ${borderColor}`,
      }}
      onClick={onFocus}
    >
      <div
        className="flex flex-col items-start shrink-0"
        style={{ width: '120px' }}
      >
        <span
          className="text-xs"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
        >
          INTEL #{slot.id}
        </span>
        <span
          className="text-base truncate w-full"
          style={{ fontFamily: "'Noto Serif SC', serif", color: rawColors.cream }}
        >
          <span style={{ color: rawColors.brass }}>{slot.digit}.</span> {slot.word}
        </span>
      </div>
      <span className="text-sm shrink-0" style={{ color: rawColors.brassDim }}>→</span>
      <div className="flex-1 min-w-0">
        <TypewriterInput
          value={slot.clue}
          onChange={onChange}
          placeholder="Enter clue..."
          aria-label={`Intel ${slot.id} clue`}
          disabled={disabled}
          maxLength={8}
          color="light"
          autoFocus={isFocused}
        />
      </div>
      {filled && (
        <span className="text-lg" style={{ color: rawColors.teamFriendly }}>✓</span>
      )}
    </div>
  );
}

export default function Encryptor() {
  const {
    secretDigits, secretWords, myWords,
    history: gameHistory, submitClues, sendProgress,
  } = useGameStore();

  const [focusedClue, setFocusedClue] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [slots, setSlots] = useState<ClueSlot[]>(() =>
    secretDigits.map((num, i) => ({
      id: i + 1,
      digit: num,
      word: secretWords[i] || '',
      clue: '',
    }))
  );

  const codewords: CodeWord[] = myWords.map((word, i) => ({ number: i + 1, word }));
  const highlightedDigit = slots.find((s) => s.id === focusedClue)?.digit ?? 0;

  const history = useMemo<HistoryEntry[]>(() => {
    return gameHistory
      .filter((row) => row.secret && row.clues.length > 0)
      .map((row) => ({
        round: row.round,
        entries: row.clues.map((clue, i) => ({
          number: row.secret ? row.secret[i] : 0,
          word: myWords[row.secret ? row.secret[i] - 1 : 0] || '',
          clue,
        })),
      }));
  }, [gameHistory, myWords]);

  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const filledCount = slots.filter((s) => s.clue.trim() !== '').length;

  // Broadcast initial idle state once on mount (teammate/opponent start cold)
  useEffect(() => {
    sendProgress('encrypt', 0, { state: 'idle', focus: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast editing state when interacting — on focus change OR fill change
  useEffect(() => {
    if (isSubmitted || !hasInteracted) return;
    sendProgress('encrypt', filledCount, { state: 'editing', focus: focusedClue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedClue, filledCount, hasInteracted, isSubmitted]);

  const allCluesFilled = filledCount === slots.length;

  const handleClueChange = (slotId: number, value: string) => {
    const sanitized = value.replace(/[<>{}[\]|\\^`]/g, '').slice(0, 8);
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, clue: sanitized } : s));
  };

  const handleSubmit = () => {
    if (allCluesFilled) {
      sendProgress('encrypt', 3, { state: 'submitted', focus: 0 });
      setIsSubmitted(true);
      submitClues(slots.map((s) => s.clue) as [string, string, string]);
    }
  };

  const handleSlotFocus = (slotId: number) => {
    if (!hasInteracted) setHasInteracted(true);
    setFocusedClue(slotId);
  };

  const config = encryptorTensionConfig[tension];

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.tensionNormalBg;
      case 'warning': return rawColors.tensionWarningBg;
      case 'tense': return rawColors.tensionTenseBg;
      case 'critical': return rawColors.tensionCriticalBg;
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      {tension === 'critical' && (
        <div className="absolute top-8 right-8 z-20 pointer-events-none">
          <RubberStamp text="URGENT" color="red" size="large" rotation={-8} animated />
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Codeword reference strip */}
        <div className="px-4 mt-3">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{ background: rawColors.navyLight, border: `2px solid ${rawColors.brassDim}` }}
          >
            <div
              className="text-center text-xs mb-3"
              style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
            >
              CODEWORD REFERENCE
            </div>
            <div className="flex justify-center gap-3 lg:gap-5">
              {codewords.map((cw) => (
                <CodeWordCard
                  key={cw.number}
                  codeword={cw}
                  isHighlighted={cw.number === highlightedDigit}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Clue input slots */}
        <div className="flex-1 px-4 mt-3 overflow-y-auto">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{ background: rawColors.navyLight, border: `1px solid ${rawColors.brassDim}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
              >
                COMPOSE INTEL [{filledCount}/{slots.length}]
              </span>
              <button
                className="text-xs"
                onClick={() => setShowHistory(true)}
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
              >
                [PAST INTEL LOG]
              </button>
            </div>
            <div className="space-y-2">
              {slots.map((slot) => (
                <ClueInputSlot
                  key={slot.id}
                  slot={slot}
                  isFocused={focusedClue === slot.id && !isSubmitted}
                  disabled={isSubmitted}
                  onFocus={() => handleSlotFocus(slot.id)}
                  onChange={(v) => handleClueChange(slot.id, v)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        {allCluesFilled && !isSubmitted && (
          <div className="flex justify-center py-3">
            <DossierButton variant="stamp" team="friendly" size="medium" onClick={handleSubmit}>
              DISPATCH INTEL
            </DossierButton>
          </div>
        )}

        {/* History drawer */}
        {showHistory && (
          <>
            <div className="absolute inset-0 bg-black/50 z-40" onClick={() => setShowHistory(false)} />
            <div className="absolute bottom-0 left-0 right-0 z-50">
              <PaperCard variant="index" className="mx-4 rounded-t-lg">
                <div className="p-6 pb-8 max-h-80 overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                    <span
                      className="text-lg font-bold"
                      style={{ fontFamily: "'Special Elite', cursive", color: rawColors.inkBlack }}
                    >
                      My Encryption Log
                    </span>
                    <button
                      className="text-sm"
                      style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack, opacity: 0.6 }}
                      onClick={() => setShowHistory(false)}
                    >
                      [ CLOSE ▼ ]
                    </button>
                  </div>
                  <div className="space-y-4">
                    {history.map((round) => (
                      <div key={round.round}>
                        <span
                          className="text-sm font-bold block mb-2"
                          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}
                        >
                          Round {round.round}
                        </span>
                        <div className="space-y-1">
                          {round.entries.map((entry, idx) => (
                            <div
                              key={idx}
                              className="text-sm"
                              style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}
                            >
                              {entry.number} {entry.word} → &quot;{entry.clue}&quot;
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PaperCard>
            </div>
          </>
        )}

        {/* Bottom agent */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={config.emoji} message={config.message} theme="friendly" />
        </div>
      </div>
    </div>
  );
}
