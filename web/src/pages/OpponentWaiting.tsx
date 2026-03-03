import { useState, useEffect, useCallback } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { TensionLevel, rawColors, opponentMascotConfig } from '../theme/colors';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// Noise Window Component - renders animated random block noise
// ============================================================

interface NoiseWindowProps {
  index: number;
  tension: TensionLevel;
  refreshInterval: number;
}

const NOISE_CHARS = ['▓', '░', '▓', '░', '▓', '░', '█', ' '];
const ROWS = 3;
const COLS = 10;

function NoiseWindow({ index, tension, refreshInterval }: NoiseWindowProps) {
  const [noiseGrid, setNoiseGrid] = useState<string[][]>([]);

  const generateNoise = useCallback(() => {
    const grid: string[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = [];
      for (let c = 0; c < COLS; c++) {
        row.push(NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)]);
      }
      grid.push(row);
    }
    return grid;
  }, []);

  useEffect(() => {
    setNoiseGrid(generateNoise());
    if (prefersReducedMotion) return;
    const timer = setInterval(() => {
      setNoiseGrid(generateNoise());
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [generateNoise, refreshInterval]);

  const borderColor = tension === 'critical' ? '#8a2a2a' : '#5a1a1a';
  const textColor = tension === 'critical' ? '#ff4444' : '#cc3333';

  return (
    <div className="flex flex-col items-center">
      {/* Noise box */}
      <div
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center overflow-hidden"
        style={{
          background: rawColors.opponentCrtScreen,
          border: `2px solid ${borderColor}`,
          boxShadow: `inset 0 0 15px rgba(255, 0, 0, 0.1)`,
        }}
      >
        <pre
          className="text-xs leading-tight select-none"
          style={{
            fontFamily: "'VT323', monospace",
            color: textColor,
            textShadow: `0 0 4px rgba(255, 68, 68, 0.5)`,
            opacity: tension === 'critical' ? 1 : 0.8,
          }}
        >
          {noiseGrid.map((row, i) => (
            <span key={i}>
              {row.join('')}
              {i < ROWS - 1 && '\n'}
            </span>
          ))}
        </pre>
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <div
          className="text-sm font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: borderColor,
          }}
        >
          #{index}
        </div>
        <div
          className="text-xs font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: textColor,
            textShadow: `0 0 4px rgba(255, 68, 68, 0.3)`,
          }}
        >
          NOISE
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Signal Strength Meter Component
// ============================================================

const SIGNAL_CHARS = ['▂', '▄', '▆', '█'];

function SignalStrengthMeter({ tension }: { tension: TensionLevel }) {
  const [bars, setBars] = useState<string[]>([]);

  useEffect(() => {
    const generate = () => {
      const count = 10;
      const newBars: string[] = [];
      for (let i = 0; i < count; i++) {
        newBars.push(SIGNAL_CHARS[Math.floor(Math.random() * SIGNAL_CHARS.length)]);
      }
      return newBars;
    };

    setBars(generate());
    if (prefersReducedMotion) return;
    const speed = tension === 'critical' ? 100 : tension === 'tense' ? 200 : 400;
    const timer = setInterval(() => {
      setBars(generate());
    }, speed);
    return () => clearInterval(timer);
  }, [tension]);

  return (
    <div className="flex items-center justify-center gap-2">
      <span
        className="text-xs"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemy,
          opacity: 0.7,
        }}
      >
      </span>
      <span
        className="text-lg tracking-wider"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemy,
          textShadow: `0 0 6px rgba(255, 68, 68, 0.6)`,
        }}
      >
        {bars.join('')}
      </span>
    </div>
  );
}

// ============================================================
// Mosaic Avatar Component
// ============================================================

function MosaicAvatar({ tension }: { tension: TensionLevel }) {
  const [blocks, setBlocks] = useState<string[]>([]);

  useEffect(() => {
    const generate = () => {
      const chars = ['▓', '░', '█', '▒'];
      return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]);
    };

    setBlocks(generate());
    if (prefersReducedMotion) return;
    const speed = tension === 'critical' ? 80 : 300;
    const timer = setInterval(() => {
      setBlocks(generate());
    }, speed);
    return () => clearInterval(timer);
  }, [tension]);

  return (
    <div
      className="w-16 h-16 rounded-lg flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: rawColors.opponentCrtScreen,
        border: `2px solid ${rawColors.opponentNormalBorder}`,
        boxShadow: `0 0 10px rgba(255, 68, 68, 0.2)`,
      }}
    >
      {/* Mosaic blocks background */}
      <pre
        className="absolute inset-0 flex items-center justify-center text-xs leading-none select-none"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemyDim,
          opacity: 0.6,
        }}
      >
        {blocks.slice(0, 3).join('')}
        {'\n'}
        {blocks.slice(3, 6).join('')}
        {'\n'}
        {blocks.slice(6, 9).join('')}
      </pre>

      {/* Center question mark */}
      <span
        className="relative z-10 text-xl font-bold"
        style={{
          fontFamily: "'VT323', monospace",
          color: rawColors.teamEnemy,
          textShadow: `0 0 8px rgba(255, 68, 68, 0.8)`,
        }}
      >
        (?)
      </span>
    </div>
  );
}

// ============================================================
// Static Noise Border Component
// ============================================================

function StaticNoiseBorder() {
  const [pattern, setPattern] = useState('');

  useEffect(() => {
    const generate = () => {
      const chars = ['▓', '░'];
      return Array.from({ length: 60 }, () => chars[Math.floor(Math.random() * 2)]).join('');
    };

    setPattern(generate());
    if (prefersReducedMotion) return;
    const timer = setInterval(() => {
      setPattern(generate());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="w-full text-center select-none overflow-hidden whitespace-nowrap"
      style={{
        fontFamily: "'VT323', monospace",
        fontSize: '8px',
        lineHeight: '8px',
        color: rawColors.teamEnemyDim,
        opacity: 0.4,
      }}
    >
      {pattern}
    </div>
  );
}

// ============================================================
// Main OpponentWaiting Page
// ============================================================

export default function OpponentWaiting() {
  const [timeLeft, setTimeLeft] = useState(90);
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

  // Background color based on tension
  const getBgColor = () => {
    switch (tension) {
      case 'normal':
        return rawColors.opponentNormalBg;
      case 'warning':
        return rawColors.opponentWarningBg;
      case 'tense':
        return rawColors.opponentTenseBg;
      case 'critical':
        return rawColors.opponentCriticalBg;
      default:
        return rawColors.opponentNormalBg;
    }
  };

  // Noise refresh speed based on tension
  const getNoiseSpeed = () => {
    switch (tension) {
      case 'normal':
        return 200;
      case 'warning':
        return 150;
      case 'tense':
        return 100;
      case 'critical':
        return 60;
      default:
        return 200;
    }
  };

  const mascot = opponentMascotConfig[tension];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0505 100%)`,
      }}
    >
      {/* Critical pulsing overlay */}
      {tension === 'critical' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: 'rgba(255, 0, 0, 0.05)',
            animation: 'pulse-red 1s ease-in-out infinite',
          }}
        />
      )}

      <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes flicker-red {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="relative z-10 h-full flex flex-col">
        {/* Top noise border */}
        <StaticNoiseBorder />

        {/* Top area: countdown */}
        <div className="flex flex-col items-center pt-4">
          <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        {/* Enemy info area */}
        <div className="flex flex-col items-center mt-4 gap-2">
          <span
            className="text-lg"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.teamEnemy,
              textShadow: `0 0 8px rgba(255, 68, 68, 0.5)`,
            }}
          >
          </span>

          <MosaicAvatar tension={tension} />

          {/* ENCRYPTED label */}
          <span
            className="text-sm tracking-widest"
            style={{
              fontFamily: "'VT323', monospace",
              color: rawColors.teamEnemy,
              textShadow: `0 0 6px rgba(255, 68, 68, 0.6)`,
              animation: 'flicker-red 2s ease-in-out infinite',
            }}
          >
            ENCRYPTED
          </span>
        </div>

        {/* Noise listening area */}
        <div className="flex-1 flex flex-col items-center mt-4 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg relative"
            style={{
              background: rawColors.opponentScreenBg,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: `inset 0 0 30px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 68, 68, 0.1)`,
            }}
          >
            {/* Inner noise border top */}
            <StaticNoiseBorder />

            {/* Desktop: 3 columns */}
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {[1, 2, 3].map((i) => (
                <NoiseWindow
                  key={i}
                  index={i}
                  tension={tension}
                  refreshInterval={getNoiseSpeed()}
                />
              ))}
            </div>

            {/* Mobile: 2+1 layout */}
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              <div className="flex justify-center gap-4">
                {[1, 2].map((i) => (
                  <NoiseWindow
                    key={i}
                    index={i}
                    tension={tension}
                    refreshInterval={getNoiseSpeed()}
                  />
                ))}
              </div>
              <div className="flex justify-center">
                <NoiseWindow
                  index={3}
                  tension={tension}
                  refreshInterval={getNoiseSpeed()}
                />
              </div>
            </div>

            {/* Inner noise border bottom */}
            <StaticNoiseBorder />
          </div>
        </div>

        {/* Signal strength meter */}
        <div className="py-2">
          <SignalStrengthMeter tension={tension} />
        </div>

        {/* Bottom mascot area */}
        <div className="pb-4 px-4">
          <div
            className="w-full max-w-md mx-auto p-4 rounded-lg relative"
            style={{
              background: rawColors.opponentCrtScreen,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: `inset 0 0 20px rgba(0, 0, 0, 0.6)`,
            }}
          >
            {/* Mascot noise border top */}
            <StaticNoiseBorder />

            <div className="flex flex-col items-center justify-center py-2" aria-live="polite">
              {/* Expression */}
              <div
                className="text-2xl"
                aria-hidden="true"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamEnemy,
                  textShadow: `0 0 8px rgba(255, 68, 68, 0.6)`,
                }}
              >
                {mascot.emoji}
              </div>

              {/* Status text */}
              <span
                className="text-sm mt-1"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: rawColors.teamEnemy,
                  textShadow: `0 0 4px rgba(255, 68, 68, 0.4)`,
                }}
              >
                {mascot.message}
              </span>
            </div>

            {/* Mascot noise border bottom */}
            <StaticNoiseBorder />
          </div>
        </div>

        {/* Bottom noise border */}
        <StaticNoiseBorder />
      </div>
    </div>
  );
}
