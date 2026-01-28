import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CRTContainer, CRTPanel, TensionLevel } from '../components/CRTContainer';
import { CountdownTimer } from '../components/CountdownTimer';
import { MascotProgress } from '../components/Mascot';

// 密语卡片数据
interface SecretCard {
  id: number;
  number: number;
  word: string;
  clue: string;
}

// 历史记录
interface HistoryEntry {
  round: number;
  entries: { number: number; word: string; clue: string }[];
}

// 紧张度配置（带吉祥物状态）
const tensionConfigWithMascot = {
  normal: {
    bg: '#1a2f1a',
    text: '#00ff88',
    progressBar: '#00ff88',
    emoji: '(•‿•)',
    message: '专注加密中...',
    glowIntensity: 1,
    mascotProgress: 'ready' as MascotProgress,
  },
  warning: {
    bg: '#2f2a1a',
    text: '#88ff00',
    progressBar: '#88ff00',
    emoji: '(•_•;)',
    message: '时间不多了...',
    glowIntensity: 1.2,
    mascotProgress: 'almost' as MascotProgress,
  },
  tense: {
    bg: '#2f1a1a',
    text: '#ffaa00',
    progressBar: '#ffaa00',
    emoji: '(°△°;)',
    message: '快快快！',
    glowIntensity: 1.5,
    mascotProgress: 'received' as MascotProgress,
  },
  critical: {
    bg: '#3a1010',
    text: '#ff4444',
    progressBar: '#ff4444',
    emoji: '(°Д°;)',
    message: '！！！',
    glowIntensity: 2,
    mascotProgress: 'waiting' as MascotProgress,
  },
};

export default function Encryptor() {
  const [currentCard, setCurrentCard] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 模拟数据
  const [cards] = useState<SecretCard[]>([
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

  // 计算紧张度
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

  // 倒计时
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

  const allCluesFilled = cards.every((card) => card.clue.trim() !== '');

  const handleClueChange = (cardId: number, value: string) => {
    const sanitized = value.replace(/[<>{}[\]|\\^`]/g, '').slice(0, 8);
    console.log(`Card ${cardId} clue:`, sanitized);
  };

  const handleSubmit = () => {
    if (allCluesFilled) {
      setIsSubmitted(true);
      console.log('Submitting clues:', cards.map((c) => c.clue));
    }
  };

  const config = tensionConfigWithMascot[tension];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${config.bg} 0%, #0a0f0a 100%)`,
      }}
    >
      <CRTContainer showScanlines={true} showVignette={true} showReflection={true} intensity="medium">
        <div className="relative z-10 h-full flex flex-col">
          {/* 顶部区域：倒计时和进度 */}
          <div className="flex flex-col items-center pt-6">
            <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />

            {/* 进度指示器 */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {cards.map((card, index) => (
                <div key={card.id} className="flex items-center">
                  {index > 0 && <span className="text-[#3a3a3a] mx-1">/</span>}
                  <motion.span
                    className="text-lg font-mono cursor-pointer"
                    style={{
                      fontFamily: "'VT323', monospace",
                      color:
                        index < currentCard
                          ? '#00ff88'
                          : index === currentCard
                            ? config.text
                            : '#3a3a3a',
                      textShadow:
                        index === currentCard ? `0 0 10px ${config.text}` : 'none',
                    }}
                    animate={{
                      scale: index === currentCard ? 1.1 : 1,
                    }}
                    onClick={() => !isSubmitted && setCurrentCard(index)}
                  >
                    {index < currentCard ? '✓' : index + 1}
                  </motion.span>
                </div>
              ))}
              <span
                className="text-[#3a3a3a] text-sm ml-2"
                style={{ fontFamily: "'VT323', monospace" }}
              >
                ({currentCard + 1}/{cards.length})
              </span>
            </div>
          </div>

          {/* 中间区域：卡片 */}
          <div className="flex-1 flex items-center justify-center">
            {/* 左箭头 */}
            <motion.button
              className="absolute left-4 z-20 hidden lg:block"
              onClick={() => setCurrentCard((prev) => Math.max(0, prev - 1))}
              disabled={currentCard === 0 || isSubmitted}
              whileHover={{ scale: currentCard === 0 ? 1 : 1.2 }}
              whileTap={{ scale: currentCard === 0 ? 1 : 0.9 }}
              style={{
                opacity: currentCard === 0 ? 0.3 : 0.7,
              }}
            >
              <span
                className="text-4xl font-bold"
                style={{ color: config.text }}
              >
                ‹
              </span>
            </motion.button>

            {/* 卡片容器 */}
            <div className="relative w-full max-w-lg mx-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentCard}
                  className="absolute inset-0"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                >
                  <CRTPanel
                    className="p-1"
                    borderColor={isSubmitted ? '#3d5544' : '#4a4a4a'}
                    background="#0a0f0a"
                  >
                    <div className="crt-screen-inner p-6 flex flex-col h-full min-h-[400px]">
                      {/* 卡片头部 */}
                      <div className="text-center">
                        <span
                          className="text-[#3a3a3a] text-sm font-mono"
                          style={{ fontFamily: "'VT323', monospace" }}
                        >
                          密码 #{currentCard + 1}
                        </span>
                      </div>

                      {/* 密码数字 */}
                      <div className="flex-1 flex items-center justify-center">
                        <span
                          className="text-6xl font-bold font-mono"
                          style={{
                            fontFamily: "'VT323', monospace",
                            color: isSubmitted ? '#00ff88' : '#ffaa00',
                            textShadow: `0 0 20px ${isSubmitted ? '#00ff88' : '#ffaa00'}`,
                          }}
                        >
                          {cards[currentCard].number}
                        </span>
                      </div>

                      {/* 密语词 */}
                      <div className="text-center">
                        <span
                          className="text-xl font-mono"
                          style={{
                            color: '#f5f0e6',
                            textShadow: '0 0 5px rgba(245, 240, 230, 0.5)',
                          }}
                        >
                          {cards[currentCard].word}
                        </span>
                      </div>

                      {/* 输入框 */}
                      <div className="mt-4">
                        <div
                          className="relative bg-[#0a0f0a] rounded border border-[#3d5544] overflow-hidden"
                          style={{
                            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
                          }}
                        >
                          <input
                            type="text"
                            value={cards[currentCard].clue}
                            onChange={(e) => handleClueChange(cards[currentCard].id, e.target.value)}
                            placeholder="输入线索词..."
                            className="w-full px-4 py-3 bg-transparent text-lg font-mono outline-none"
                            style={{
                              fontFamily: "'VT323', 'Courier New', monospace",
                              color: '#00ff88',
                              textShadow: '0 0 5px #00ff88',
                            }}
                            disabled={isSubmitted}
                          />
                        </div>
                      </div>

                      {/* 底部按钮区域 */}
                      <div className="mt-auto pt-4 flex gap-2">
                        <motion.button
                          className="flex-1 py-2 rounded border border-[#3d5544] text-[#00ff88] text-sm font-mono hover:bg-[#3d5544] hover:bg-opacity-20 transition-colors"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setShowHistory(true)}
                          style={{ fontFamily: "'VT323', monospace" }}
                        >
                          [📋 历史]
                        </motion.button>
                        <motion.button
                          className="flex-1 py-2 rounded border border-[#3d5544] text-[#00ff88] text-sm font-mono hover:bg-[#3d5544] hover:bg-opacity-20 transition-colors"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setCurrentCard((prev) => Math.min(cards.length - 1, prev + 1))}
                          disabled={currentCard === cards.length - 1 || isSubmitted}
                          style={{
                            opacity: currentCard === cards.length - 1 ? 0.3 : 1,
                          }}
                        >
                          [下一张 ›]
                        </motion.button>
                      </div>
                    </div>
                  </CRTPanel>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* 右箭头 */}
            <motion.button
              className="absolute right-4 z-20 hidden lg:block"
              onClick={() => setCurrentCard((prev) => Math.min(cards.length - 1, prev + 1))}
              disabled={currentCard === cards.length - 1 || isSubmitted}
              whileHover={{ scale: currentCard === cards.length - 1 ? 1 : 1.2 }}
              whileTap={{ scale: currentCard === cards.length - 1 ? 1 : 0.9 }}
              style={{
                opacity: currentCard === cards.length - 1 ? 0.3 : 0.7,
              }}
            >
              <span
                className="text-4xl font-bold"
                style={{ color: config.text }}
              >
                ›
              </span>
            </motion.button>
          </div>

          {/* 底部区域：发送按钮 */}
          <div className="h-24 flex items-center justify-center">
            <AnimatePresence>
              {allCluesFilled && !isSubmitted && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <motion.button
                    className="px-8 py-3 rounded font-bold text-lg"
                    style={{
                      fontFamily: "'VT323', monospace",
                      background: `linear-gradient(180deg, #00ff88 0%, #00aa55 50%, #008844 100%)`,
                      color: '#0a0f0a',
                      boxShadow: '0 4px 0 #005533, 0 6px 20px rgba(0, 255, 136, 0.4)',
                    }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95, y: 2 }}
                    onClick={handleSubmit}
                  >
                    ◆ 发送加密 ◆
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {isSubmitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <span
                  className="text-xl font-mono"
                  style={{
                    fontFamily: "'VT323', monospace",
                    color: '#00ff88',
                    textShadow: '0 0 10px #00ff88',
                  }}
                >
                  ✓ 已发送，等待队友...
                </span>
              </motion.div>
            )}
          </div>

          {/* 装饰：设备边框螺丝 */}
          <div className="absolute top-4 left-4 w-3 h-3 screw opacity-50" />
          <div className="absolute top-4 right-4 w-3 h-3 screw opacity-50" />
          <div className="absolute bottom-4 left-4 w-3 h-3 screw opacity-50" />
          <div className="absolute bottom-4 right-4 w-3 h-3 screw opacity-50" />
        </div>
      </CRTContainer>

      {/* 紧张状态下的抖动效果 */}
      {(tension === 'tense' || tension === 'critical') && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-50"
          animate={{
            x:
              tension === 'critical'
                ? [0, -2, 2, -2, 2, 0]
                : [0, -1, 1, -1, 0],
          }}
          transition={{
            duration: tension === 'critical' ? 0.1 : 0.2,
            repeat: Infinity,
            repeatType: 'loop',
          }}
        />
      )}

      {/* 历史线索抽屉 */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              className="absolute inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
            />

            <motion.div
              className="absolute bottom-0 left-0 right-0 z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div
                className="relative mx-4 rounded-t-lg"
                style={{
                  background: '#f5f0e6',
                  backgroundImage:
                    'repeating-linear-gradient(transparent, transparent 28px, #a0c4e8 28px, #a0c4e8 29px)',
                }}
              >
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
                      📝 我的加密记录
                    </span>
                    <motion.button
                      className="text-sm"
                      style={{
                        fontFamily: "'VT323', monospace",
                        color: '#4a4a4a',
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowHistory(false)}
                    >
                      [ 收起 ▼ ]
                    </motion.button>
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
                              {entry.number} {entry.word} → "{entry.clue}"
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 紧急情况下的红色脉冲 */}
      {tension === 'critical' && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          animate={{
            opacity: [0, 0.15, 0],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
          }}
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255, 68, 68, 0.3), transparent 70%)',
          }}
        />
      )}
    </div>
  );
}
