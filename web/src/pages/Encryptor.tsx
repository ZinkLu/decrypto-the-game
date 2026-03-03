import { useState, useEffect } from 'react';
import { PhosphorText } from '../components/PhosphorText';
import { CRTInput } from '../components/CRTInput';
import { TensionLevel, encryptorTensionConfig, rawColors } from '../theme/colors';

// Secret card data
interface SecretCard {
  id: number;
  number: number;
  word: string;
  clue: string;
}

// History entry
interface HistoryEntry {
  round: number;
  entries: { number: number; word: string; clue: string }[];
}

// Use encryptorTensionConfig from theme
const tensionConfig = encryptorTensionConfig;

export default function Encryptor() {
  const [currentCard, setCurrentCard] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Mock data - should come from game state in real app
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

  // Calculate tension level
  useEffect(() => {
    if (timeLeft > 30) {
      setTension('normal');
    } else if (timeLeft > 15) {
      setTension('warning');
    } else if (timeLeft > 5) {
      setTension('tense');
    } else {
      setTension('critical');
    }
  }, [timeLeft]);

  // Countdown
  useEffect(() => {
    if (isSubmitted) return;

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
  }, [isSubmitted]);

  // Check if all clues are filled
  const allCluesFilled = cards.every((card) => card.clue.trim() !== '');

  // Handle clue input change
  const handleClueChange = (cardId: number, value: string) => {
    const sanitized = value.replace(/[<>{}[\]|\\^`]/g, '').slice(0, 8);
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, clue: sanitized } : card
      )
    );
  };

  // Handle submit
  const handleSubmit = () => {
    if (allCluesFilled) {
      setIsSubmitted(true);
      console.log('Submitting clues:', cards.map((c) => c.clue));
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const config = tensionConfig[tension];

  // Get raw color for progress bar
  const getProgressBarColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.tensionNormalText;
      case 'warning':
        return rawColors.tensionWarningText;
      case 'tense':
        return rawColors.tensionTenseText;
      case 'critical':
        return rawColors.tensionCriticalText;
      default:
        return rawColors.tensionNormalText;
    }
  };

  // Get raw bg color
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

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0f0a 100%)`,
      }}
    >
      {/* Top countdown area */}
      <div className="relative z-10 flex flex-col items-center pt-6">
        {/* Time display */}
        <div className="flex items-center gap-4" role="timer" aria-live="polite" aria-label={`剩余时间 ${formatTime(timeLeft)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          <PhosphorText
            text={formatTime(timeLeft)}
            size="large"
            color={tension === 'critical' ? 'amber' : 'green'}
          />
        </div>

        {/* Progress bar */}
        <div className="w-64 h-2 mt-3 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#3a3a3a]">
          <div
            className="h-full rounded-full transition-[width,background-color] duration-1000"
            style={{
              backgroundColor: getProgressBarColor(),
              width: `${(timeLeft / 90) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Progress indicator */}
      <div className="relative z-10 flex items-center justify-center gap-2 mt-4">
        {cards.map((card, index) => (
          <div key={card.id} className="flex items-center">
            {index > 0 && <span className="text-[#3a3a3a] mx-1">/</span>}
            <span
              className="text-lg font-mono"
              style={{
                color:
                  index < currentCard
                    ? '#00ff88'
                    : index === currentCard
                      ? getProgressBarColor()
                      : '#3a3a3a',
              }}
            >
              {index < currentCard ? <span aria-label="完成">✓</span> : index + 1}
            </span>
          </div>
        ))}
        <span className="text-[#3a3a3a] text-sm ml-2">({currentCard + 1}/{cards.length})</span>
      </div>

      {/* Card area */}
      <div className="relative z-10 flex items-center justify-center h-[55%] mt-4 overflow-hidden">
        {/* Left peek card */}
        {currentCard > 0 && (
          <button
            aria-label="上一张卡片"
            className="absolute left-0 z-5 hidden lg:block cursor-pointer"
            style={{
              width: '80px',
              height: '85%',
              background: 'none',
              padding: 0,
            }}
            onClick={() => setCurrentCard((prev) => Math.max(0, prev - 1))}
          >
            <div
              className="h-full rounded-r-lg opacity-50"
              style={{
                background: 'linear-gradient(90deg, transparent, #1a2a1a)',
                borderRight: '2px solid #3d5544',
              }}
            >
              <div className="h-full flex items-center justify-center">
                <span
                  className="text-4xl font-mono opacity-30"
                  style={{ color: '#00ff88' }}
                >
                  {cards[currentCard - 1].number}
                </span>
              </div>
            </div>
          </button>
        )}

        {/* Right peek card */}
        {currentCard < cards.length - 1 && (
          <button
            aria-label="下一张卡片"
            className="absolute right-0 z-5 hidden lg:block cursor-pointer"
            style={{
              width: '80px',
              height: '85%',
              background: 'none',
              padding: 0,
            }}
            onClick={() => setCurrentCard((prev) => Math.min(cards.length - 1, prev + 1))}
          >
            <div
              className="h-full rounded-l-lg opacity-50"
              style={{
                background: 'linear-gradient(-90deg, transparent, #1a2a1a)',
                borderLeft: '2px solid #3d5544',
              }}
            >
              <div className="h-full flex items-center justify-center">
                <span
                  className="text-4xl font-mono opacity-30"
                  style={{ color: '#00ff88' }}
                >
                  {cards[currentCard + 1].number}
                </span>
              </div>
            </div>
          </button>
        )}

        {/* Main card container */}
        <div className="relative w-full max-w-md mx-16 lg:mx-24 h-full">
          <div className="absolute inset-0">
            {/* Card */}
            <div
              className="h-full rounded-lg"
              style={{
                maxWidth: '100%',
                background: `linear-gradient(145deg, #2a2a2a, #1a1a1a)`,
                border: `2px solid ${rawColors.teamFriendlyDim}`,
              }}
            >
              <div className="h-full p-6 flex flex-col">
                {/* Card header */}
                <div className="text-center">
                  <span
                    className="text-[#3a3a3a] text-sm font-mono"
                    style={{ fontFamily: "'VT323', monospace" }}
                  >
                    密码 #{currentCard + 1}
                  </span>
                </div>

                {/* Secret number */}
                <div className="flex-1 flex items-center justify-center">
                  <PhosphorText
                    text={cards[currentCard].number.toString()}
                    size="large"
                    color="green"
                  />
                </div>

                {/* Secret word */}
                <div className="text-center">
                  <span
                    className="text-xl font-mono"
                    style={{
                      color: '#f5f0e6',
                    }}
                  >
                    {cards[currentCard].word}
                  </span>
                </div>

                {/* Input */}
                <div className="mt-4">
                  <CRTInput
                    value={cards[currentCard].clue}
                    onChange={(value) => handleClueChange(cards[currentCard].id, value)}
                    placeholder="输入线索词…"
                    aria-label={`密码 ${currentCard + 1} 线索词`}
                    disabled={isSubmitted}
                    maxLength={8}
                    color="green"
                  />
                </div>

                {/* History button */}
                <div className="mt-auto pt-4">
                  <button
                    className="w-full py-2 rounded border border-[#3d5544] text-[#00ff88] text-sm font-mono hover:bg-[#3d5544] hover:bg-opacity-20 transition-colors"
                    onClick={() => setShowHistory(true)}
                    style={{ fontFamily: "'VT323', monospace" }}
                  >
                    [<span aria-hidden="true">📋</span> 历史线索]
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile swipe hint */}
        <div className="lg:hidden absolute bottom-2 left-0 right-0 text-center">
          <span
            className="text-xs font-mono"
            style={{
              fontFamily: "'VT323', monospace",
              color: '#3d5544',
            }}
          >
            ← 点击两侧切换 →
          </span>
        </div>
      </div>

      {/* Submit button (shows when on last card and all clues filled) */}
      {currentCard === 2 && allCluesFilled && !isSubmitted && (
        <div className="relative z-10 flex justify-center mt-4">
          <button
            className="px-8 py-3 rounded font-bold text-lg"
            style={{
              fontFamily: "'VT323', monospace",
              background: `linear-gradient(180deg, #00ff88 0%, #00aa55 50%, #008844 100%)`,
              color: '#0a0f0a',
            }}
            onClick={handleSubmit}
          >
            <span aria-hidden="true">◆</span> 发送加密 <span aria-hidden="true">◆</span>
          </button>
        </div>
      )}

      {/* History drawer */}
      {showHistory && (
        <>
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 z-40"
            onClick={() => setShowHistory(false)}
          />

          {/* Drawer */}
          <div className="absolute bottom-0 left-0 right-0 z-50">
            {/* Paper effect */}
            <div
              className="relative mx-4 rounded-t-lg"
              style={{
                background: '#f5f0e6',
                backgroundImage:
                  'repeating-linear-gradient(transparent, transparent 28px, #a0c4e8 28px, #a0c4e8 29px)',
              }}
            >
              {/* Torn edge top */}
              <div className="absolute -top-3 left-4 right-4 h-3">
                <svg viewBox="0 0 100 10" className="w-full h-full">
                  <path
                    d="M0,10 L5,5 L10,10 L15,3 L20,10 L25,6 L30,10 L35,4 L40,10 L45,5 L50,10 L55,4 L60,10 L65,6 L70,10 L75,3 L80,10 L85,5 L90,10 L95,4 L100,10 Z"
                    fill="#f5f0e6"
                  />
                </svg>
              </div>

              <div className="p-6 pb-8 max-h-80 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <span
                    className="text-lg font-bold"
                    style={{
                      fontFamily: "'VT323', monospace",
                      color: '#2a2a2a',
                    }}
                  >
                    <span aria-hidden="true">📝</span> 我的加密记录
                  </span>
                  <button
                    className="text-sm"
                    style={{
                      fontFamily: "'VT323', monospace",
                      color: '#4a4a4a',
                    }}
                    onClick={() => setShowHistory(false)}
                  >
                    [ 收起 ▼ ]
                  </button>
                </div>

                <div className="space-y-4">
                  {history.map((round) => (
                    <div key={round.round}>
                      <span
                        className="text-sm font-bold block mb-2"
                        style={{
                          fontFamily: "'VT323', monospace",
                          color: '#4a4a4a',
                        }}
                      >
                        第 {round.round} 轮
                      </span>
                      <div className="space-y-1">
                        {round.entries.map((entry, idx) => (
                          <div
                            key={idx}
                            className="text-sm"
                            style={{
                              fontFamily: "'VT323', monospace",
                              color: '#2a2a2a',
                            }}
                          >
                            {entry.number} {entry.word} → &quot;{entry.clue}&quot;
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom mascot area */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{ height: '15%', minHeight: '100px' }}
      >
        {/* Border */}
        <div
          className="absolute inset-0 rounded-t-lg"
          style={{
            background: `linear-gradient(145deg, #3a3a3a, #2a2a2a)`,
            borderTop: '4px solid #4a4a4a',
          }}
        />

        {/* Inner screen */}
        <div
          className="absolute inset-x-4 bottom-2 top-2 rounded overflow-hidden"
          style={{
            background: '#0a0f0a',
            border: '2px solid #1a1a1a',
          }}
        >
          {/* Mascot content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            {/* Expression */}
            <div
              className="text-4xl"
              style={{
                color: getProgressBarColor(),
              }}
            >
              {config.emoji}
            </div>

            {/* Status text */}
            <span
              className="text-sm mt-1"
              style={{
                fontFamily: "'VT323', monospace",
                color: getProgressBarColor(),
              }}
            >
              {config.message}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
