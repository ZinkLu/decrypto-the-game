import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { transitionConfig, type TransitionRole } from '../theme/colors';

// Re-export for backward compatibility
export type { TransitionRole } from '../theme/colors';

// 角色图标映射
const roleIcons: Record<TransitionRole, string> = {
  encryptor: '🔐',
  teammate: '📡',
  opponent: '🎯',
};

interface TransitionOverlayProps {
  role: TransitionRole;
  duration?: number;
  onComplete?: () => void;
}

/**
 * 过渡动画组件
 *
 * 使用方式：
 * 1. 在页面提交时显示过渡层
 * 2. 0.8秒后自动调用 onComplete
 *
 * 动画时序：
 * - 0.0s-0.1s: 图标出现
 * - 0.1s-0.5s: 打字机效果显示文字
 * - 0.5s-0.8s: 完成展示
 *
 * 增强效果：
 * - 打字机逐字显示
 * - 角色图标
 * - CRT 扫描线滚动
 */
export function TransitionOverlay({
  role,
  duration = 800,
  onComplete,
}: TransitionOverlayProps) {
  const config = transitionConfig[role];
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [visibleChars, setVisibleChars] = useState(0);
  const [scanlineOffset, setScanlineOffset] = useState(0);

  const icon = roleIcons[role];
  const text = config.text;
  const textArray = useMemo(() => text.split(''), [text]);

  // 打字机效果
  useEffect(() => {
    if (visibleChars < textArray.length) {
      const charDelay = 80; // 每个字符 80ms
      const timer = setTimeout(() => {
        setVisibleChars((prev) => prev + 1);
      }, charDelay);
      return () => clearTimeout(timer);
    }
  }, [visibleChars, textArray.length]);

  // 扫描线动画
  useEffect(() => {
    const scanlineInterval = setInterval(() => {
      setScanlineOffset((prev) => (prev + 2) % 100);
    }, 30);
    return () => clearInterval(scanlineInterval);
  }, []);

  // 过渡完成
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTransitioning(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: config.bgColor,
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: isTransitioning ? 1 : 0 }}
      transition={{
        duration: duration / 1000,
        ease: 'easeInOut',
      }}
    >
      {/* CRT 扫描线效果 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 2px,
            rgba(0, 0, 0, 0.15) 2px,
            rgba(0, 0, 0, 0.15) 4px
          )`,
          transform: `translateY(${scanlineOffset}px)`,
        }}
      />

      {/* 移动扫描光条 */}
      <motion.div
        className="absolute inset-x-0 h-1 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom,
            transparent,
            ${config.color}30,
            ${config.color}50,
            ${config.color}30,
            transparent
          )`,
          height: '8px',
          filter: 'blur(2px)',
        }}
        initial={{ top: 0 }}
        animate={{ top: '100%' }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* 主内容 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 0.05,
          duration: 0.2,
        }}
        className="text-center relative z-10"
      >
        {/* 角色图标 */}
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: 0,
            duration: 0.2,
            type: 'spring',
            stiffness: 300,
          }}
          className="mb-4"
        >
          <span
            className="text-5xl"
            style={{
              filter: `drop-shadow(0 0 15px ${config.color})`,
            }}
          >
            {icon}
          </span>
        </motion.div>

        {/* 打字机文字 */}
        <div
          className="text-4xl font-bold font-mono relative"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
            textShadow: `0 0 20px ${config.color}, 0 0 40px ${config.color}`,
            minHeight: '1.5em',
          }}
        >
          <AnimatePresence mode="popLayout">
            {textArray.slice(0, visibleChars).map((char, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.05,
                }}
              >
                {char}
              </motion.span>
            ))}
          </AnimatePresence>

          {/* 打字机光标 */}
          {visibleChars < textArray.length && (
            <motion.span
              className="inline-block ml-0.5"
              style={{
                color: config.color,
                textShadow: `0 0 10px ${config.color}`,
              }}
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              ▌
            </motion.span>
          )}
        </div>

        {/* 省略号动画 - 打字完成后显示 */}
        <motion.div
          className="mt-4 flex justify-center gap-2"
          style={{ color: config.color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: visibleChars >= textArray.length ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            style={{ textShadow: `0 0 5px ${config.color}` }}
          >
            ●
          </motion.span>
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            style={{ textShadow: `0 0 5px ${config.color}` }}
          >
            ●
          </motion.span>
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            style={{ textShadow: `0 0 5px ${config.color}` }}
          >
            ●
          </motion.span>
        </motion.div>
      </motion.div>

      {/* 角落装饰 */}
      <div
        className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />

      {/* 边缘渐晕 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%)',
        }}
      />
    </motion.div>
  );
}

/**
 * 封装好的过渡控制器 Hook
 * 返回：isTransitioning, showTransition, transitionTo
 */
export function useTransition(role: TransitionRole, onTransitionEnd?: () => void) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetPage, setTargetPage] = useState<string | null>(null);

  const showTransition = () => {
    setIsTransitioning(true);
  };

  const transitionTo = (page: string) => {
    setTargetPage(page);
    setIsTransitioning(true);
  };

  const handleComplete = () => {
    onTransitionEnd?.();
    if (targetPage) {
      // 这里可以添加页面跳转逻辑
      console.log('Transition to:', targetPage);
    }
  };

  return {
    isTransitioning,
    showTransition,
    transitionTo,
    handleComplete,
    role,
  };
}

/**
 * 带过渡效果的页面容器
 * 自动处理淡入淡出
 */
interface TransitionPageProps {
  children: React.ReactNode;
  isVisible: boolean;
  bgColor?: string;
}

export function TransitionPage({
  children,
  isVisible,
  bgColor = '#0a0f0a',
}: TransitionPageProps) {
  return (
    <motion.div
      className="fixed inset-0"
      style={{ background: bgColor }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: isVisible ? 1 : 0,
      }}
      transition={{
        duration: 0.2,
        ease: 'easeOut',
      }}
    >
      {children}
    </motion.div>
  );
}

export default TransitionOverlay;
