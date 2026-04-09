import { useState, useEffect } from 'react';
import { TensionLevel, rawColors } from '../../theme/colors';

interface DeskClockTimerProps {
  totalSeconds: number;
  onTimeUp?: () => void;
  showProgressBar?: boolean;
  size?: 'small' | 'medium' | 'large';
  showMinutes?: boolean;
  theme?: 'friendly' | 'opponent' | 'alert';
}

const sizeConfig = {
  small: { clockSize: 80, fontSize: '1.25rem', barWidth: 48 },
  medium: { clockSize: 120, fontSize: '2rem', barWidth: 64 },
  large: { clockSize: 160, fontSize: '2.5rem', barWidth: 80 },
};

export function DeskClockTimer({
  totalSeconds,
  onTimeUp,
  showProgressBar = true,
  size = 'medium',
  showMinutes = true,
  theme = 'friendly',
}: DeskClockTimerProps) {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [tension, setTension] = useState<TensionLevel>('normal');

  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft <= 0) { onTimeUp?.(); return; }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return showMinutes ? `${mins}:${secs.toString().padStart(2, '0')}` : secs.toString().padStart(2, '0');
  };

  const progress = timeLeft / totalSeconds;
  const config = sizeConfig[size];
  const r = (config.clockSize - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDash = circumference * progress;

  const getColor = () => {
    if (theme === 'opponent') return rawColors.teamEnemy;
    if (theme === 'alert') {
      switch (tension) {
        case 'normal': return rawColors.intelRed;
        case 'warning': return rawColors.brass;
        case 'tense': return rawColors.teamEnemy;
        case 'critical': return rawColors.tensionCriticalText;
      }
    }
    switch (tension) {
      case 'normal': return rawColors.teamFriendly;
      case 'warning': return rawColors.brass;
      case 'tense': return rawColors.intelRed;
      case 'critical': return rawColors.tensionCriticalText;
    }
  };

  const color = getColor();

  return (
    <div className="flex flex-col items-center" role="timer" aria-live="polite" aria-label={`Time remaining ${formatTime(timeLeft)}`}>
      {/* Clock face */}
      <div className="relative" style={{ width: config.clockSize, height: config.clockSize }}>
        <svg width={config.clockSize} height={config.clockSize} className="transform -rotate-90">
          {/* Brass bezel background */}
          <circle
            cx={config.clockSize / 2}
            cy={config.clockSize / 2}
            r={r + 4}
            fill="none"
            stroke={rawColors.brassDim}
            strokeWidth="3"
          />
          {/* Track */}
          <circle
            cx={config.clockSize / 2}
            cy={config.clockSize / 2}
            r={r}
            fill="none"
            stroke={rawColors.navyLight}
            strokeWidth="4"
          />
          {/* Progress arc */}
          <circle
            cx={config.clockSize / 2}
            cy={config.clockSize / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            className="transition-[stroke-dasharray,stroke] duration-1000"
          />
        </svg>

        {/* Time readout */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            fontFamily: "'Special Elite', cursive",
            fontSize: config.fontSize,
            color: color,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Optional progress bar */}
      {showProgressBar && (
        <div
          className="mt-2 rounded-full overflow-hidden"
          style={{
            width: `${config.barWidth}px`,
            height: '4px',
            background: rawColors.navyLight,
            border: `1px solid ${rawColors.brassDim}`,
          }}
        >
          <div
            className="h-full rounded-full transition-[width,background-color] duration-1000"
            style={{
              backgroundColor: color,
              width: `${progress * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DeskClockTimer;
