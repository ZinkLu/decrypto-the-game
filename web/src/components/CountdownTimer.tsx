import { useState, useEffect } from 'react';
import { PhosphorText } from './PhosphorText';
import { TensionLevel, rawColors } from '../theme/colors';

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

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (showMinutes) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return secs.toString().padStart(2, '0');
  };

  const progressPercent = (timeLeft / totalSeconds) * 100;

  const sizeConfig = {
    small: {
      textSize: 'medium' as const,
      barWidth: '48',
      barHeight: '4',
    },
    medium: {
      textSize: 'large' as const,
      barWidth: '64',
      barHeight: '8',
    },
    large: {
      textSize: 'large' as const,
      barWidth: '80',
      barHeight: '12',
    },
  };

  const { textSize, barWidth, barHeight } = sizeConfig[size];

  // Get the raw color for the progress bar based on tension
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

  return (
    <div className="flex flex-col items-center">
      {/* Time display */}
      <PhosphorText
        text={formatTime(timeLeft)}
        size={textSize}
        color={tension === 'critical' ? 'amber' : 'green'}
      />

      {/* Progress bar */}
      {showProgressBar && (
        <div
          className="mt-2 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#3a3a3a]"
          style={{
            width: `${barWidth}px`,
            height: `${barHeight}px`,
            minHeight: '4px',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              backgroundColor: getProgressBarColor(),
              width: `${progressPercent}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Simple countdown (numbers only)
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
      }}
    >
      {formatTime(timeLeft)}
    </span>
  );
}

export default CountdownTimer;
