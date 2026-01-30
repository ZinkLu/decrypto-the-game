import { useState, useEffect, useCallback } from 'react';
import {
  MascotAction,
  MascotFrame,
  mascotAnimations,
  mascotStateConfig,
  tensionActionOverride,
  mascotColors,
  MascotState,
} from '../theme/mascot';
import { TensionLevel, rawColors } from '../theme/colors';

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

  // Determine current action
  const getActiveAction = useCallback((): MascotAction => {
    if (tension !== 'normal' && tensionActionOverride[tension]) {
      return tensionActionOverride[tension];
    }
    if (isPlayingIdleAction) {
      return currentAction;
    }
    return stateConfig.primaryAction;
  }, [tension, isPlayingIdleAction, currentAction, stateConfig]);

  // Animation frame loop
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
            setIsPlayingIdleAction(false);
            return animation.frames.length - 1;
          }
        }
        return nextFrame;
      });
    }, animation.frameDuration);

    return () => clearInterval(interval);
  }, [getActiveAction]);

  // Randomly trigger idle actions
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

  // Reset frame when action changes
  useEffect(() => {
    setCurrentFrame(0);
  }, [currentAction, progress, tension]);

  const activeAction = getActiveAction();
  const animation = mascotAnimations[activeAction];
  const frame: MascotFrame = animation?.frames[currentFrame] || { face: '(・_・)' };

  const isCritical = tension === 'critical';
  const isTense = tension === 'tense';

  return (
    <div
      className={`rounded-lg ${sizes.padding}`}
      style={{
        background: rawColors.bgDark,
        border: `2px solid ${isCritical ? '#5a2020' : isTense ? '#4a3a2a' : '#3d5544'}`,
      }}
    >
      <div className="flex flex-col items-center justify-center">
        {/* Progress indicator */}
        <div
          className="text-xs font-mono mb-2"
          style={{
            fontFamily: "'VT323', monospace",
            color: isCritical ? '#ff4444' : '#3d5544',
          }}
        >
          [{completedCount}/{totalCount}]
        </div>

        {/* Mascot body */}
        <div className="relative flex flex-col items-center">
          {/* Accessory */}
          {frame.accessory && (
            <span
              className={`absolute -right-6 -top-2 ${sizes.accessorySize}`}
            >
              {frame.accessory}
            </span>
          )}

          {/* Face */}
          <div
            className={sizes.faceSize}
            style={{
              fontFamily: "'VT323', monospace",
              color: color,
            }}
          >
            {frame.face}
          </div>

          {/* Body */}
          {frame.body && (
            <div
              className={`${sizes.bodySize} -mt-1`}
              style={{
                fontFamily: "'VT323', monospace",
                color: color,
                opacity: 0.8,
              }}
            >
              {frame.body}
            </div>
          )}
        </div>

        {/* Status text */}
        <span
          className={`${sizes.textSize} mt-2 font-mono`}
          style={{
            fontFamily: "'VT323', monospace",
            color: color,
          }}
        >
          {stateConfig.message}
        </span>
      </div>
    </div>
  );
}

/**
 * Desktop mascot area
 */
export function MascotDesktop({ progress, completedCount, tension }: Omit<MascotProps, 'size'>) {
  return (
    <div className="w-full max-w-md mx-auto">
      <Mascot progress={progress} completedCount={completedCount} tension={tension} size="medium" />
    </div>
  );
}

/**
 * Mobile mascot
 */
export function MascotMobile({ progress, completedCount, tension }: Omit<MascotProps, 'size'>) {
  return (
    <div className="w-full">
      <Mascot progress={progress} completedCount={completedCount} tension={tension} size="small" />
    </div>
  );
}

export default Mascot;
