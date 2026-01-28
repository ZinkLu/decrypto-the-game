import { motion } from 'framer-motion';
import { useState } from 'react';
import { CRTContainer } from './CRTContainer';
import { CRTPanel } from './CRTContainer';

export type MascotProgress = 'waiting' | 'received' | 'almost' | 'ready';

interface MascotState {
  emoji: string;
  message: string;
  animation: 'idle' | 'watch' | 'nervous' | 'celebrate';
}

const mascotStates: Record<MascotProgress, MascotState> = {
  waiting: {
    emoji: '(・_・)',
    message: '等待中...',
    animation: 'idle',
  },
  received: {
    emoji: '(・ω・)',
    message: '收到信号...',
    animation: 'watch',
  },
  almost: {
    emoji: '(•‿•)',
    message: '快好了...',
    animation: 'nervous',
  },
  ready: {
    emoji: '(^_^)',
    message: '准备就绪！',
    animation: 'celebrate',
  },
};

interface MascotProps {
  progress: MascotProgress;
  completedCount: number;
  totalCount?: number;
  tension?: 'normal' | 'warning' | 'tense' | 'critical';
  size?: 'small' | 'medium' | 'large';
}

export function Mascot({
  progress,
  completedCount,
  totalCount = 3,
  tension = 'normal',
  size = 'medium',
}: MascotProps) {
  const state = mascotStates[progress];
  const [isEasterEgg, setIsEasterEgg] = useState(false);

  // 紧张状态下的额外动画
  const isCritical = tension === 'critical';
  const isTense = tension === 'tense';

  const sizeClasses = {
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-6xl',
  };

  const textSize = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
  };

  // 进度文字
  const progressText = `${completedCount}/${totalCount}`;

  // 根据动画类型确定动画配置
  const getAnimationConfig = () => {
    if (isCritical) {
      return {
        animate: {
          scale: [1, 1.1, 1, 1.05, 1],
          rotate: [-1, 1, -1, 0],
          x: [0, -2, 2, -2, 0],
        },
        transition: { duration: 0.2, repeat: Infinity, repeatType: 'loop' as const },
      };
    }
    if (isTense) {
      return {
        animate: { scale: [1, 1.03, 1] },
        transition: { duration: 0.5, repeat: Infinity },
      };
    }
    if (state.animation === 'celebrate') {
      return {
        animate: {
          scale: [1, 1.1, 0.95, 1.05, 1],
          y: [0, -5, 0],
        },
        transition: { duration: 0.6 },
      };
    }
    if (state.animation === 'watch') {
      return {
        animate: { scale: [1, 1.02, 1] },
        transition: { duration: 2, repeat: Infinity },
      };
    }
    return {
      animate: { scale: 1 },
      transition: { duration: 1 },
    };
  };

  const animationConfig = getAnimationConfig();

  return (
    <CRTPanel
      className="w-full"
      borderColor={isCritical ? '#5a2020' : isTense ? '#4a3a2a' : '#3d5544'}
      background="#0a0f0a"
    >
      <CRTContainer
        showScanlines={true}
        showVignette={true}
        showReflection={true}
        intensity="low"
      >
        <div className="flex flex-col items-center justify-center p-4">
          {/* 进度指示 */}
          <div
            className="text-xs font-mono mb-2"
            style={{
              fontFamily: "'VT323', monospace",
              color: isCritical ? '#ff4444' : '#3d5544',
            }}
          >
            [{progressText}]
          </div>

          {/* 吉祥物表情 */}
          <motion.div
            className={`${sizeClasses[size]} ${isCritical ? 'cursor-pointer' : ''}`}
            style={{
              color: isCritical ? '#ff4444' : '#00ff88',
              textShadow: isCritical
                ? '0 0 10px #ff4444, 0 0 20px #ff4444'
                : '0 0 10px #00ff88, 0 0 20px #00ff88',
            }}
            animate={animationConfig.animate}
            transition={animationConfig.transition}
            onClick={() => !isCritical && setIsEasterEgg(true)}
          >
            {isEasterEgg ? '(≧▽≦)' : state.emoji}
          </motion.div>

          {/* 状态文字 */}
          <motion.span
            className={`${textSize[size]} mt-2 font-mono`}
            style={{
              fontFamily: "'VT323', monospace",
              color: isCritical ? '#ff4444' : '#00ff88',
              textShadow: `0 0 5px ${isCritical ? '#ff4444' : '#00ff88'}`,
            }}
            animate={
              isCritical
                ? { opacity: [1, 0.5, 1] }
                : { opacity: [1, 0.7, 1] }
            }
            transition={
              isCritical
                ? { duration: 0.3, repeat: Infinity }
                : { duration: 1.5, repeat: Infinity }
            }
          >
            {state.message}
          </motion.span>

          {/* 紧张状态下的额外效果 */}
          {isCritical && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 68, 68, 0.2), transparent 70%)',
              }}
              animate={{
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
              }}
            />
          )}
        </div>
      </CRTContainer>
    </CRTPanel>
  );
}

/**
 * 桌面端宽屏吉祥物区域
 */
export function MascotDesktop({ progress, completedCount, tension }: Omit<MascotProps, 'size'>) {
  return (
    <div className="w-full max-w-md mx-auto">
      <Mascot progress={progress} completedCount={completedCount} tension={tension} size="medium" />
    </div>
  );
}

/**
 * 移动端紧凑吉祥物
 */
export function MascotMobile({ progress, completedCount, tension }: Omit<MascotProps, 'size'>) {
  return (
    <div className="w-full">
      <Mascot progress={progress} completedCount={completedCount} tension={tension} size="small" />
    </div>
  );
}

export default Mascot;
