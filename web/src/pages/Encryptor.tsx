import { useState, useEffect } from 'react';
import { TensionLevel, encryptorTensionConfig, rawColors } from '../theme/colors';
import {
  PaperCard, TypewriterInput, DeskClockTimer, DossierButton,
  AgentPanel, RubberStamp, DossierEffectLayer,
} from '../components/dossier';

interface SecretCard {
  id: number;
  number: number;
  word: string;
  clue: string;
}

interface HistoryEntry {
  round: number;
  entries: { number: number; word: string; clue: string }[];
}

const tensionConfig = encryptorTensionConfig;

export default function Encryptor() {
  const [currentCard, setCurrentCard] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cards, setCards] = useState<SecretCard[]>([
    { id: 1, number: 3, word: '咖啡', clue: '' },
    { id: 2, number: 1, word: '猫咪', clue: '' },
    { id: 3, number: 4, word: '钥匙', clue: '' },
  ]);

  const [history] = useState<HistoryEntry[]>([
    {
      round: 1,
      entries: [
        { number: 3, word: '咖啡', clue: '苦涩' },
        { number: 1, word: '猫咪', clue: '毛茸' },
        { number: 4, word: '钥匙', clue: '开门' },
      ],
    },
    {
      round: 2,
      entries: [
        { number: 2, word: '月亮', clue: '银色' },
        { number: 4, word: '钥匙', clue: '金属' },
        { number: 1, word: '猫咪', clue: '喵' },
      ],
    },
  ]);

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

  const allCluesFilled = cards.every((card) => card.clue.trim() !== '');

  const handleClueChange = (cardId: number, value: string) => {
    const sanitized = value.replace(/[<>{}[\]|\\^`]/g, '').slice(0, 8);
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, clue: sanitized } : card
      )
    );
  };

  const handleSubmit = () => {
    if (allCluesFilled) {
      setIsSubmitted(true);
      console.log('Submitting clues:', cards.map((c) => c.clue));
    }
  };

  const config = tensionConfig[tension];

  const getTensionColor = () => {
    switch (tension) {
      case 'normal': return rawColors.teamFriendly;
      case 'warning': return rawColors.brass;
      case 'tense': return rawColors.intelRed;
      case 'critical': return rawColors.tensionCriticalText;
    }
  };

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

      {/* URGENT stamp on critical */}
      {tension === 'critical' && (
        <div className="absolute top-8 right-8 z-20 pointer-events-none">
          <RubberStamp text="URGENT" color="red" size="large" rotation={-8} animated />
        </div>
      )}

      {/* Top countdown */}
      <div className="relative z-10 flex flex-col items-center pt-6">
        <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
      </div>

      {/* Progress indicator */}
      <div className="relative z-10 flex items-center justify-center gap-2 mt-3">
        {cards.map((card, index) => (
          <div key={card.id} className="flex items-center">
            {index > 0 && <span className="mx-1" style={{ color: rawColors.brassDim }}>·</span>}
            <span
              className="text-lg"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: index < currentCard ? rawColors.teamFriendly
                  : index === currentCard ? getTensionColor()
                  : rawColors.navyLight,
              }}
            >
              {index < currentCard ? '✓' : index + 1}
            </span>
          </div>
        ))}
        <span className="text-sm ml-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
          ({currentCard + 1}/{cards.length})
        </span>
      </div>

      {/* Card area */}
      <div className="relative z-10 flex items-center justify-center h-[55%] mt-4 overflow-hidden">
        {/* Left peek */}
        {currentCard > 0 && (
          <button
            aria-label="上一张卡片"
            className="absolute left-0 z-5 hidden lg:block cursor-pointer"
            style={{ width: '80px', height: '85%', background: 'none', padding: 0 }}
            onClick={() => setCurrentCard((prev) => Math.max(0, prev - 1))}
          >
            <div
              className="h-full opacity-50 rounded-r"
              style={{
                background: `linear-gradient(90deg, transparent, ${rawColors.navyLight})`,
                borderRight: `2px solid ${rawColors.brassDim}`,
              }}
            >
              <div className="h-full flex items-center justify-center">
                <span className="text-3xl" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.brass, opacity: 0.4 }}>
                  {cards[currentCard - 1].number}
                </span>
              </div>
            </div>
          </button>
        )}

        {/* Right peek */}
        {currentCard < cards.length - 1 && (
          <button
            aria-label="下一张卡片"
            className="absolute right-0 z-5 hidden lg:block cursor-pointer"
            style={{ width: '80px', height: '85%', background: 'none', padding: 0 }}
            onClick={() => setCurrentCard((prev) => Math.min(cards.length - 1, prev + 1))}
          >
            <div
              className="h-full opacity-50 rounded-l"
              style={{
                background: `linear-gradient(-90deg, transparent, ${rawColors.navyLight})`,
                borderLeft: `2px solid ${rawColors.brassDim}`,
              }}
            >
              <div className="h-full flex items-center justify-center">
                <span className="text-3xl" style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.brass, opacity: 0.4 }}>
                  {cards[currentCard + 1].number}
                </span>
              </div>
            </div>
          </button>
        )}

        {/* Main card */}
        <div className="relative w-full max-w-md mx-16 lg:mx-24 h-full">
          <div className="absolute inset-0">
            <PaperCard showPaperClip showCoffeeStain className="h-full">
              <div className="p-6 flex flex-col h-full">
                {/* Card header */}
                <div className="text-center">
                  <span
                    className="text-sm"
                    style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack, opacity: 0.5 }}
                  >
                    情报 #{currentCard + 1}
                  </span>
                </div>

                {/* Secret number - brass token style */}
                <div className="flex-1 flex items-center justify-center">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: `radial-gradient(circle at 35% 35%, ${rawColors.brassLight}, ${rawColors.brass}, ${rawColors.brassDim})`,
                      boxShadow: `inset 0 2px 4px rgba(255,255,255,0.15), 0 3px 8px rgba(0,0,0,0.4)`,
                      border: `3px solid ${rawColors.brassDim}`,
                    }}
                  >
                    <span
                      className="text-4xl font-bold"
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        color: rawColors.navyDark,
                      }}
                    >
                      {cards[currentCard].number}
                    </span>
                  </div>
                </div>

                {/* Secret word */}
                <div className="text-center mb-4">
                  <span
                    className="text-xl"
                    style={{
                      fontFamily: "'Noto Serif SC', serif",
                      color: rawColors.inkBlack,
                    }}
                  >
                    {cards[currentCard].word}
                  </span>
                </div>

                {/* Input */}
                <TypewriterInput
                  value={cards[currentCard].clue}
                  onChange={(value) => handleClueChange(cards[currentCard].id, value)}
                  placeholder="输入线索词…"
                  aria-label={`情报 ${currentCard + 1} 线索词`}
                  disabled={isSubmitted}
                  maxLength={8}
                  color="dark"
                />

                {/* History button */}
                <div className="mt-auto pt-4">
                  <button
                    className="w-full py-2 rounded text-sm transition-colors"
                    onClick={() => setShowHistory(true)}
                    style={{
                      fontFamily: "'Courier Prime', monospace",
                      color: rawColors.inkBlack,
                      border: `1px solid ${rawColors.creamDark}`,
                      background: rawColors.creamDark,
                    }}
                  >
                    [历史情报记录]
                  </button>
                </div>
              </div>
            </PaperCard>
          </div>
        </div>

        {/* Mobile swipe hint */}
        <div className="lg:hidden absolute bottom-2 left-0 right-0 text-center">
          <span className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}>
            ← 点击两侧切换 →
          </span>
        </div>
      </div>

      {/* Submit button */}
      {currentCard === 2 && allCluesFilled && !isSubmitted && (
        <div className="relative z-10 flex justify-center mt-4">
          <DossierButton variant="stamp" team="friendly" size="large" onClick={handleSubmit}>
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
                  <span className="text-lg font-bold" style={{ fontFamily: "'Special Elite', cursive", color: rawColors.inkBlack }}>
                    我的加密记录
                  </span>
                  <button
                    className="text-sm"
                    style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack, opacity: 0.6 }}
                    onClick={() => setShowHistory(false)}
                  >
                    [ 收起 ▼ ]
                  </button>
                </div>
                <div className="space-y-4">
                  {history.map((round) => (
                    <div key={round.round}>
                      <span className="text-sm font-bold block mb-2" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
                        第 {round.round} 轮
                      </span>
                      <div className="space-y-1">
                        {round.entries.map((entry, idx) => (
                          <div key={idx} className="text-sm" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.inkBlack }}>
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

      {/* Bottom agent panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-4 px-4">
        <AgentPanel emoji={config.emoji} message={config.message} theme="friendly" />
      </div>
    </div>
  );
}
