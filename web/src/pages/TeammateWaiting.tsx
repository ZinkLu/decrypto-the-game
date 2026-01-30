import { useState, useEffect } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { TensionLevel, rawColors } from '../theme/colors';

// Mock data
interface TeammateData {
  name: string;
  avatar?: string;
  isCurrentEncryptor: boolean;
}

interface WaveformState {
  id: number;
  state: 'active' | 'completed' | 'waiting';
  statusText: string;
}

export default function TeammateWaiting() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [completedCount, setCompletedCount] = useState(0);
  const [waveforms, setWaveforms] = useState<WaveformState[]>([
    { id: 1, state: 'active', statusText: '正在输入' },
    { id: 2, state: 'waiting', statusText: '等待中' },
    { id: 3, state: 'waiting', statusText: '等待中' },
  ]);

  // Mock encryptor data
  const encryptor: TeammateData = {
    name: '小明',
    isCurrentEncryptor: true,
  };

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
    if (timeLeft <= 0) return;

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
  }, [timeLeft]);

  // Simulate waveform state changes
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 1 ? { ...w, state: 'completed' as const, statusText: '已完成' } : w
        )
      );
      setCompletedCount(1);
    }, 5000);

    const timer2 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 2 ? { ...w, state: 'completed' as const, statusText: '已完成' } : w
        )
      );
      setCompletedCount(2);
    }, 10000);

    const timer3 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 3 ? { ...w, state: 'completed' as const, statusText: '已完成' } : w
        )
      );
      setCompletedCount(3);
    }, 15000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Get mascot message based on progress
  const getMascotMessage = () => {
    if (completedCount === 0) return '等待加密中...';
    if (completedCount === 1) return '收到第一条!';
    if (completedCount === 2) return '快完成了!';
    return '全部收到!';
  };

  const getMascotEmoji = () => {
    if (completedCount === 0) return '(・_・)';
    if (completedCount === 1) return '(^_^)';
    if (completedCount === 2) return '(^o^)';
    return '\\(^o^)/';
  };

  // Get raw bg color based on tension
  const getBgColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.tensionNormalBg;
      case 'warning':
        return rawColors.tensionWarningBg;
      case 'tense':
        return rawColors.tensionTenseBg;
      case 'critical':
        return rawColors.tensionCriticalBg;
      default:
        return rawColors.tensionNormalBg;
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)`,
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        {/* Top area: countdown */}
        <div className="flex flex-col items-center pt-6">
          <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
        </div>

        {/* Encryptor info area */}
        <div className="flex flex-col items-center mt-4">
          <div className="flex items-center gap-3">
            {/* Avatar/icon */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(145deg, ${rawColors.teamFriendlyDim}, ${rawColors.crtScreenLight})`,
                border: `2px solid ${rawColors.teamFriendly}`,
              }}
            >
              <span className="text-xl">🎧</span>
            </div>

            {/* Name and status */}
            <span
              className="text-lg font-mono"
              style={{
                fontFamily: "'VT323', monospace",
                color: rawColors.teamFriendly,
              }}
            >
              {encryptor.name} 正在加密...
            </span>
          </div>
        </div>

        {/* Waveform indicator area */}
        <div className="flex-1 flex flex-col items-center mt-6">
          {/* Panel */}
          <div
            className="w-full max-w-4xl mx-4 p-4 rounded-lg"
            style={{
              background: rawColors.crtScreenLight,
              border: `2px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            {/* Desktop: 3 columns */}
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {waveforms.map((waveform) => (
                <StatusIndicator
                  key={waveform.id}
                  index={waveform.id}
                  state={waveform.state}
                  statusText={waveform.statusText}
                />
              ))}
            </div>

            {/* Mobile: 2+1 layout */}
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              {/* First row: 2 indicators */}
              <div className="flex justify-center gap-4">
                {waveforms.slice(0, 2).map((waveform) => (
                  <StatusIndicator
                    key={waveform.id}
                    index={waveform.id}
                    state={waveform.state}
                    statusText={waveform.statusText}
                  />
                ))}
              </div>

              {/* Second row: 1 indicator */}
              <div className="flex justify-center">
                {waveforms.slice(2, 3).map((waveform) => (
                  <StatusIndicator
                    key={waveform.id}
                    index={waveform.id}
                    state={waveform.state}
                    statusText={waveform.statusText}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom mascot area */}
        <div className="h-32 flex items-end justify-center pb-4">
          <div
            className="w-full max-w-md mx-auto p-4 rounded-lg"
            style={{
              background: rawColors.bgDark,
              border: `2px solid ${rawColors.teamFriendlyDim}`,
            }}
          >
            <div className="flex flex-col items-center justify-center">
              {/* Progress indicator */}
              <div
                className="text-xs font-mono mb-2"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamFriendlyDim,
                }}
              >
                [{completedCount}/3]
              </div>

              {/* Expression */}
              <div
                className="text-2xl"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamFriendly,
                }}
              >
                {getMascotEmoji()}
              </div>

              {/* Status text */}
              <span
                className="text-sm mt-1 font-mono"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamFriendly,
                }}
              >
                {getMascotMessage()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple status indicator component to replace WaveformWindow
interface StatusIndicatorProps {
  index: number;
  state: 'active' | 'completed' | 'waiting';
  statusText: string;
}

function StatusIndicator({ index, state, statusText }: StatusIndicatorProps) {
  const getColor = () => {
    switch (state) {
      case 'active':
        return rawColors.crtPhosphor;
      case 'completed':
        return rawColors.teamFriendlyDim;
      case 'waiting':
        return rawColors.tensionNormalBg;
      default:
        return rawColors.teamFriendlyDim;
    }
  };

  const color = getColor();

  return (
    <div className="flex flex-col items-center">
      {/* Status box */}
      <div
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center"
        style={{
          background: rawColors.crtScreen,
          border: `2px solid ${color}`,
        }}
      >
        <span
          className="text-2xl"
          style={{ color }}
        >
          {state === 'completed' ? '✓' : state === 'active' ? '...' : '—'}
        </span>
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <div
          className="text-sm font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color,
          }}
        >
          #{index} {state === 'completed' && '✓'}
        </div>
        <div
          className="text-xs font-mono opacity-70"
          style={{
            fontFamily: "'VT323', monospace",
            color,
          }}
        >
          {statusText}
        </div>
      </div>
    </div>
  );
}
