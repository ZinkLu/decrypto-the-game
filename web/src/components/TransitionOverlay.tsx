import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * 角色类型
 */
export type TransitionRole = 'encryptor' | 'teammate' | 'opponent';

/**
 * 过渡配置
 */
interface TransitionConfig {
  text: string;
  color: string;
  bgColor: string;
}

const transitionConfig: Record<TransitionRole, TransitionConfig> = {
  encryptor: {
    text: '加密已发送',
    color: '#00ff88',
    bgColor: '#0a1a0a',
  },
  teammate: {
    text: '准备解码',
    color: '#00ff88',
    bgColor: '#0a1a0a',
  },
  opponent: {
    text: '信号截获',
    color: '#ff4444',
    bgColor: '#1a0a0a',
  },
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
 * - 0.0s-0.2s: 当前页面淡出
 * - 0.2s-0.6s: 显示过渡文字 (0.4s)
 * - 0.6s-0.8s: 新页面淡入
 */
export function TransitionOverlay({
  role,
  duration = 800,
  onComplete,
}: TransitionOverlayProps) {
  const config = transitionConfig[role];
  const [isTransitioning, setIsTransitioning] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTransitioning(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
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
      {/* 过渡文字 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 0.1,
          duration: 0.3,
        }}
        className="text-center"
      >
        <span
          className="text-4xl font-bold font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
            textShadow: `0 0 20px ${config.color}, 0 0 40px ${config.color}`,
          }}
        >
          {config.text}
        </span>

        {/* 省略号动画 */}
        <motion.div
          className="mt-4 flex justify-center gap-2"
          style={{ color: config.color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
          >
            .
          </motion.span>
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
          >
            .
          </motion.span>
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: 0.4 }}
          >
            .
          </motion.span>
        </motion.div>
      </motion.div>
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
