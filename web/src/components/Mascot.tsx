import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CRTContainer, CRTPanel } from './CRTContainer';
import {
  MascotAction,
  MascotFrame,
  mascotAnimations,
  mascotStateConfig,
  tensionActionOverride,
  mascotColors,
  MascotState,
} from '../theme/mascot';
import { TensionLevel } from '../theme/colors';

export type MascotProgress = MascotState;

interface MascotProps {
  progress: MascotProgress;
  completedCount: number;
  totalCount?: number;
  tension?: TensionLevel;
  size?: 'small' | 'medium' | 'large';
}

const sizeConfig = {
  small: {
    faceSize: 'text-2xl',
    bodySize: 'text-sm',
    accessorySize: 'text-lg',
    textSize: 'text-xs',
    padding: 'p-2',
  },
  medium: {
    faceSize: 'text-4xl',
    bodySize: 'text-lg',
    accessorySize: 'text-2xl',
    textSize: 'text-sm',
    padding: 'p-4',
  },
  large: {
    faceSize: 'text-6xl',
    bodySize: 'text-xl',
    accessorySize: 'text-3xl',
    textSize: 'text-base',
    padding: 'p-6',
  },
};

export function Mascot({
  progress,
  completedCount,
  totalCount = 3,
  tension = 'normal',
  size = 'medium',
}: MascotProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentAction, setCurrentAction] = useState<MascotAction>('idle');
  const [isPlayingIdleAction, setIsPlayingIdleAction] = useState(false);

  const sizes = sizeConfig[size];
  const stateConfig = mascotStateConfig[progress];
  const color = mascotColors[tension] || mascotColors.normal;

  // 确定当前应该播放的动作
  const getActiveAction = useCallback((): MascotAction => {
    // 紧张度覆盖
    if (tension !== 'normal' && tensionActionOverride[tension]) {
      return tensionActionOverride[tension];
    }
    // 正在播放闲置动作
    if (isPlayingIdleAction) {
      return currentAction;
    }
    // 默认使用状态的主动作
    return stateConfig.primaryAction;
  }, [tension, isPlayingIdleAction, currentAction, stateConfig]);

  // 动画帧循环
  useEffect(() => {
    const action = getActiveAction();
    const animation = mascotAnimations[action];

    if (!animation) return;

    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        const nextFrame = prev + 1;
        if (nextFrame >= animation.frames.length) {
          if (animation.loop) {
            return 0;
          } else {
            // 非循环动画结束后返回 idle
            setIsPlayingIdleAction(false);
            return animation.frames.length - 1;
          }
        }
        return nextFrame;
      });
    }, animation.frameDuration);

    return () => clearInterval(interval);
  }, [getActiveAction]);

  // 随机触发闲置动作
  useEffect(() => {
    if (tension !== 'normal' || !stateConfig.idleActions || isPlayingIdleAction) {
      return;
    }

    const checkIdle = setInterval(() => {
      if (Math.random() < (stateConfig.idleChance || 0.1)) {
        const randomAction =
          stateConfig.idleActions![
            Math.floor(Math.random() * stateConfig.idleActions!.length)
          ];
        setCurrentAction(randomAction);
        setCurrentFrame(0);
        setIsPlayingIdleAction(true);
      }
    }, 3000);

    return () => clearInterval(checkIdle);
  }, [tension, stateConfig, isPlayingIdleAction]);

  // 重置帧计数当动作改变时
  useEffect(() => {
    setCurrentFrame(0);
  }, [currentAction, progress, tension]);

  const activeAction = getActiveAction();
  const animation = mascotAnimations[activeAction];
  const frame: MascotFrame = animation?.frames[currentFrame] || { face: '(・_・)' };

  const isCritical = tension === 'critical';
  const isTense = tension === 'tense';

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
        <div className={`flex flex-col items-center justify-center ${sizes.padding}`}>
          {/* 进度指示 */}
          <div
            className="text-xs font-mono mb-2"
            style={{
              fontFamily: "'VT323', monospace",
              color: isCritical ? '#ff4444' : '#3d5544',
            }}
          >
            [{completedCount}/{totalCount}]
          </div>

          {/* 吉祥物主体 */}
          <motion.div
            className="relative flex flex-col items-center"
            animate={
              isCritical
                ? {
                    x: [0, -2, 2, -2, 2, 0],
                    scale: [1, 1.05, 1],
                  }
                : isTense
                  ? {
                      scale: [1, 1.02, 1],
                    }
                  : {}
            }
            transition={
              isCritical
                ? { duration: 0.15, repeat: Infinity }
                : isTense
                  ? { duration: 0.5, repeat: Infinity }
                  : {}
            }
          >
            {/* 配件（左侧或上方） */}
            {frame.accessory && (
              <motion.span
                className={`absolute -right-6 -top-2 ${sizes.accessorySize}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  filter: `drop-shadow(0 0 5px ${color})`,
                }}
              >
                {frame.accessory}
              </motion.span>
            )}

            {/* 表情 */}
            <motion.div
              className={sizes.faceSize}
              style={{
                fontFamily: "'VT323', monospace",
                color: color,
                textShadow: `0 0 10px ${color}, 0 0 20px ${color}`,
              }}
              key={frame.face}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.1 }}
            >
              {frame.face}
            </motion.div>

            {/* 身体 */}
            {frame.body && (
              <motion.div
                className={`${sizes.bodySize} -mt-1`}
                style={{
                  fontFamily: "'VT323', monospace",
                  color: color,
                  textShadow: `0 0 5px ${color}`,
                  opacity: 0.8,
                }}
                key={frame.body}
              >
                {frame.body}
              </motion.div>
            )}
          </motion.div>

          {/* 状态文字 */}
          <motion.span
            className={`${sizes.textSize} mt-2 font-mono`}
            style={{
              fontFamily: "'VT323', monospace",
              color: color,
              textShadow: `0 0 5px ${color}`,
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
            {stateConfig.message}
          </motion.span>

          {/* 紧张状态下的额外效果 */}
          {isCritical && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded"
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
