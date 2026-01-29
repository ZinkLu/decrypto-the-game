import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PhosphorText } from './PhosphorText';
import { TensionLevel, tensionConfig, rawColors } from '../theme/colors';

interface CountdownTimerProps {
  totalSeconds: number;
  onTimeUp?: () => void;
  showProgressBar?: boolean;
  size?: 'small' | 'medium' | 'large';
  showMinutes?: boolean;
}

export function CountdownTimer({
  totalSeconds,
  onTimeUp,
  showProgressBar = true,
  size = 'medium',
  showMinutes = true,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [tension, setTension] = useState<TensionLevel>('normal');

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
    if (timeLeft <= 0) {
      onTimeUp?.();
      return;
    }

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
  }, [timeLeft, onTimeUp]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (showMinutes) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return secs.toString().padStart(2, '0');
  };

  const config = tensionConfig[tension];
  const progressPercent = (timeLeft / totalSeconds) * 100;

  const sizeConfig = {
    small: {
      textSize: 'medium' as const,
      barWidth: '48',
      barHeight: '1',
    },
    medium: {
      textSize: 'large' as const,
      barWidth: '64',
      barHeight: '2',
    },
    large: {
      textSize: 'large' as const,
      barWidth: '80',
      barHeight: '3',
    },
  };

  const { textSize, barWidth, barHeight } = sizeConfig[size];

  return (
    <div className="flex flex-col items-center">
      {/* 时间显示 */}
      <PhosphorText
        text={formatTime(timeLeft)}
        size={textSize}
        color={tension === 'critical' ? 'amber' : 'green'}
      />

      {/* 进度条 */}
      {showProgressBar && (
        <motion.div
          className={`mt-2 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#3a3a3a]`}
          style={{
            width: `${barWidth}px`,
            height: `${barHeight}px`,
            minHeight: '4px',
          }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: config.progressBar,
              boxShadow: `0 0 8px ${config.progressBar}`,
            }}
            initial={{ width: '100%' }}
            animate={{
              width: `${progressPercent}%`,
              filter:
                tension === 'critical'
                  ? `brightness(1.5) drop-shadow(0 0 4px ${config.progressBar})`
                  : 'brightness(1)',
            }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </motion.div>
      )}
    </div>
  );
}

/**
 * 简洁版倒计时（仅数字）
 */
export function CountdownSimple({
  totalSeconds,
  onTimeUp,
}: Omit<CountdownTimerProps, 'showProgressBar' | 'size' | 'showMinutes'>) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp?.();
      return;
    }

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
  }, [timeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <span
      className="font-mono"
      style={{
        fontFamily: "'VT323', monospace",
        color: timeLeft < 15 ? rawColors.teamEnemy : rawColors.crtAmber,
        textShadow: `0 0 10px ${timeLeft < 15 ? rawColors.teamEnemy : rawColors.crtAmber}`,
      }}
    >
      {formatTime(timeLeft)}
    </span>
  );
}

export default CountdownTimer;
