import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhosphorText } from '../components/PhosphorText';
import { TensionLevel, encryptorTensionConfig } from '../theme/colors';

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

// Use encryptorTensionConfig from theme
const tensionConfig = encryptorTensionConfig;

export default function Encryptor() {
  const [currentCard, setCurrentCard] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90); // 90秒倒计时
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 模拟数据 - 实际应该从游戏状态获取
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
          // 自动提交逻辑
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitted]);

  // 检查是否所有输入都已填写
  const allCluesFilled = cards.every((card) => card.clue.trim() !== '');

  // 处理线索输入
  const handleClueChange = (cardId: number, value: string) => {
    // 限制长度和特殊字符
    const sanitized = value.replace(/[<>{}[\]|\\^`]/g, '').slice(0, 8);
    // 这里应该更新实际的游戏状态
    console.log(`Card ${cardId} clue:`, sanitized);
  };

  // 处理提交
  const handleSubmit = () => {
    if (allCluesFilled) {
      setIsSubmitted(true);
      // 这里应该调用实际的提交 API
      console.log('Submitting clues:', cards.map((c) => c.clue));
    }
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const config = tensionConfig[tension];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${config.bg} 0%, #0a0f0a 100%)`,
      }}
    >
      {/* CRT Scanlines */}
      <div className="crt-scanlines" />

      {/* 顶部倒计时区 */}
      <div className="relative z-10 flex flex-col items-center pt-6">
        {/* 时间显示 */}
        <div className="flex items-center gap-4">
          <PhosphorText
            text={formatTime(timeLeft)}
            size="large"
            color={tension === 'critical' ? 'amber' : 'green'}
          />
        </div>

        {/* 进度条 */}
        <div className="w-64 h-2 mt-3 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#3a3a3a]">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: config.progressBar,
              boxShadow: `0 0 10px ${config.progressBar}`,
            }}
            initial={{ width: '100%' }}
            animate={{
              width: `${(timeLeft / 90) * 100}%`,
              filter: tension === 'critical' ? `brightness(${config.glowIntensity})` : 'brightness(1)',
            }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>
      </div>

      {/* 进度指示器 */}
      <div className="relative z-10 flex items-center justify-center gap-2 mt-4">
        {cards.map((card, index) => (
          <div key={card.id} className="flex items-center">
            {index > 0 && <span className="text-[#3a3a3a] mx-1">/</span>}
            <motion.span
              className="text-lg font-mono"
              style={{
                color:
                  index < currentCard
                    ? '#00ff88'
                    : index === currentCard
                      ? config.text
                      : '#3a3a3a',
                textShadow:
                  index === currentCard
                    ? `0 0 10px ${config.text}`
                    : 'none',
              }}
              animate={{
                scale: index === currentCard ? 1.1 : 1,
              }}
            >
              {index < currentCard ? '✓' : index + 1}
            </motion.span>
          </div>
        ))}
        <span className="text-[#3a3a3a] text-sm ml-2">({currentCard + 1}/{cards.length})</span>
      </div>

      {/* 卡片区域 */}
      <div className="relative z-10 flex items-center justify-center h-[55%] mt-4">
        {/* 左箭头（桌面端） */}
        <motion.button
          className="absolute left-4 z-20 hidden lg:block"
          onClick={() => setCurrentCard((prev) => Math.max(0, prev - 1))}
          disabled={currentCard === 0}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
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
        <div className="relative w-full max-w-lg mx-4 h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCard}
              className="absolute inset-0"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              {/* 卡片 */}
              <div
                className="crt-screen h-full"
                style={{
                  maxWidth: '100%',
                  background: `linear-gradient(145deg, #2a2a2a, #1a1a1a)`,
                }}
              >
                <div className="crt-screen-inner h-full p-6 flex flex-col">
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
                    <PhosphorText
                      text={cards[currentCard].number.toString()}
                      size="large"
                      color="green"
                    />
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

                  {/* 历史线索按钮 */}
                  <div className="mt-auto pt-4">
                    <motion.button
                      className="w-full py-2 rounded border border-[#3d5544] text-[#00ff88] text-sm font-mono hover:bg-[#3d5544] hover:bg-opacity-20 transition-colors"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowHistory(true)}
                      style={{ fontFamily: "'VT323', monospace" }}
                    >
                      [📋 历史线索]
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 右箭头（桌面端） */}
        <motion.button
          className="absolute right-4 z-20 hidden lg:block"
          onClick={() => setCurrentCard((prev) => Math.min(cards.length - 1, prev + 1))}
          disabled={currentCard === cards.length - 1}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
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

      {/* 发送按钮（第三张卡片完成后显示） */}
      <AnimatePresence>
        {currentCard === 2 && allCluesFilled && !isSubmitted && (
          <motion.div
            className="relative z-10 flex justify-center mt-4"
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
            {/* 遮罩层 */}
            <motion.div
              className="absolute inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
            />

            {/* 抽屉 */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* 撕边纸张效果 */}
              <div
                className="relative mx-4 rounded-t-lg"
                style={{
                  background: '#f5f0e6',
                  backgroundImage:
                    'repeating-linear-gradient(transparent, transparent 28px, #a0c4e8 28px, #a0c4e8 29px)',
                }}
              >
                {/* 撕边顶部 */}
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
                              {entry.number} {entry.word} → &quot;{entry.clue}&quot;
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

      {/* 底部吉祥物区域（带 CRT 效果） */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{ height: '15%', minHeight: '100px' }}
      >
        {/* CRT 屏幕边框 */}
        <div
          className="absolute inset-0 rounded-t-lg"
          style={{
            background: `linear-gradient(145deg, #3a3a3a, #2a2a2a)`,
            borderTop: '4px solid #4a4a4a',
          }}
        />

        {/* CRT 屏幕内部 */}
        <div
          className="absolute inset-x-4 bottom-2 top-2 rounded overflow-hidden"
          style={{
            background: '#0a0f0a',
            border: '2px solid #1a1a1a',
          }}
        >
          {/* CRT 效果层 */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `repeating-linear-gradient(
                to bottom,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.1) 2px,
                rgba(0, 0, 0, 0.1) 4px
              )`,
            }}
          />

          {/* 屏幕边缘暗角 */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
            }}
          />

          {/* 屏幕反光 */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
            }}
          />

          {/* 吉祥物内容 */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            {/* 表情 */}
            <motion.div
              className="text-4xl"
              animate={{
                scale: tension === 'critical' ? [1, 1.1, 1] : 1,
                rotate: tension === 'critical' ? [-1, 1, -1] : 0,
                filter:
                  tension === 'critical'
                    ? `drop-shadow(0 0 10px ${config.text})`
                    : `drop-shadow(0 0 5px ${config.text})`,
              }}
              transition={{
                duration: tension === 'critical' ? 0.15 : 0.5,
                repeat: tension === 'critical' ? Infinity : 0,
              }}
              style={{
                color: config.text,
                textShadow: `0 0 10px ${config.text}, 0 0 20px ${config.text}`,
              }}
            >
              {config.emoji}
            </motion.div>

            {/* 状态文字 */}
            <motion.span
              className="text-sm mt-1"
              style={{
                fontFamily: "'VT323', monospace",
                color: config.text,
                textShadow: `0 0 5px ${config.text}`,
              }}
              animate={{
                opacity: [1, 0.7, 1],
              }}
              transition={{
                duration: tension === 'critical' ? 0.3 : 1,
                repeat: Infinity,
              }}
            >
              {config.message}
            </motion.span>
          </div>
        </div>
      </div>

      {/* 紧急情况下的红色脉冲 */}
      {tension === 'critical' && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          animate={{
            opacity: [0, 0.2, 0],
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
