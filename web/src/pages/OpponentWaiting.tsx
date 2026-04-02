import { useState, useEffect, useCallback } from 'react';
import { TensionLevel, rawColors, opponentMascotConfig } from '../theme/colors';
import { DeskClockTimer, RedactedText, RubberStamp, AgentPanel, DossierEffectLayer } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scrambled document component (replaces NoiseWindow)
function ScrambledDocument({ index, tension, refreshInterval }: { index: number; tension: TensionLevel; refreshInterval: number }) {
  const CHARS = ['█', '▓', '░', '▒', '▮', '▯'];
  const ROWS = 3;
  const COLS = 10;
  const [grid, setGrid] = useState<string[][]>([]);

  const generate = useCallback(() => {
    const g: string[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = [];
      for (let c = 0; c < COLS; c++) {
        row.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
      }
      g.push(row);
    }
    return g;
  }, []);

  useEffect(() => {
    setGrid(generate());
    if (prefersReducedMotion) return;
    const timer = setInterval(() => setGrid(generate()), refreshInterval);
    return () => clearInterval(timer);
  }, [generate, refreshInterval]);

  const borderColor = tension === 'critical' ? rawColors.teamEnemyLight : rawColors.opponentNormalBorder;
  const textColor = tension === 'critical' ? rawColors.tensionCriticalText : rawColors.teamEnemy;

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center overflow-hidden"
        style={{
          background: rawColors.opponentCrtScreen,
          border: `2px solid ${borderColor}`,
          boxShadow: 'inset 0 0 15px rgba(139, 0, 0, 0.1)',
        }}
      >
        <pre
          className="text-xs leading-tight select-none"
          style={{
            fontFamily: "'Courier Prime', monospace",
            color: textColor,
            opacity: tension === 'critical' ? 1 : 0.7,
          }}
        >
          {grid.map((row, i) => (
            <span key={i}>
              {row.join('')}
              {i < ROWS - 1 && '\n'}
            </span>
          ))}
        </pre>
      </div>
      <div className="mt-2 text-center">
        <div className="text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif", color: borderColor, letterSpacing: '1px' }}>
          #{index}
        </div>
        <div className="text-xs" style={{ fontFamily: "'Courier Prime', monospace", color: textColor }}>
          REDACTED
        </div>
      </div>
    </div>
  );
}

// Signal strength meter
function SignalStrengthMeter({ tension }: { tension: TensionLevel }) {
  const BARS = ['▂', '▄', '▆', '█'];
  const [bars, setBars] = useState<string[]>([]);

  useEffect(() => {
    const gen = () => Array.from({ length: 10 }, () => BARS[Math.floor(Math.random() * BARS.length)]);
    setBars(gen());
    if (prefersReducedMotion) return;
    const speed = tension === 'critical' ? 100 : tension === 'tense' ? 200 : 400;
    const timer = setInterval(() => setBars(gen()), speed);
    return () => clearInterval(timer);
  }, [tension]);

  return (
    <div className="flex items-center justify-center gap-2">
      <span className="text-lg tracking-wider" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemy }}>
        {bars.join('')}
      </span>
    </div>
  );
}

export default function OpponentWaiting() {
  const { encryptor, round } = useGameStore();
  void encryptor;
  void round;

  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');

  useEffect(() => {
    if (timeLeft > 30) setTension('normal');
    else if (timeLeft > 15) setTension('warning');
    else if (timeLeft > 5) setTension('tense');
    else setTension('critical');
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const getNoiseSpeed = () => {
    switch (tension) {
      case 'normal': return 200;
      case 'warning': return 150;
      case 'tense': return 100;
      case 'critical': return 60;
    }
  };

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.opponentNormalBg;
      case 'warning': return rawColors.opponentWarningBg;
      case 'tense': return rawColors.opponentTenseBg;
      case 'critical': return rawColors.opponentCriticalBg;
    }
  };

  const mascot = opponentMascotConfig[tension];

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0505 100%)` }}
    >
      <DossierEffectLayer />

      {/* Critical pulsing overlay */}
      {tension === 'critical' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ background: 'rgba(139, 0, 0, 0.05)', animation: 'pulse-red 1s ease-in-out infinite' }}
        />
      )}

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        {/* Enemy info */}
        <div className="flex flex-col items-center mt-4 gap-2">
          <RubberStamp text="INTERCEPTED TRANSMISSION" color="red" size="small" rotation={-2} />

          {/* Identity Unknown placeholder */}
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center"
            style={{
              background: rawColors.opponentCrtScreen,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: '0 0 10px rgba(139, 0, 0, 0.2)',
            }}
          >
            <div className="flex flex-col items-center">
              <span className="text-xl" style={{ color: rawColors.teamEnemy }}>?</span>
              <span className="text-[8px]" style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}>
                UNKNOWN
              </span>
            </div>
          </div>

          {/* Encrypted label */}
          <span
            className="text-sm tracking-widest"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              color: rawColors.teamEnemy,
              letterSpacing: '4px',
            }}
          >
            <RedactedText length={12} glitchSpeed={getNoiseSpeed()} />
          </span>
        </div>

        {/* Scrambled documents area */}
        <div className="flex-1 flex flex-col items-center mt-4 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg"
            style={{
              background: rawColors.opponentScreenBg,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
            }}
          >
            {/* Desktop: 3 columns */}
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {[1, 2, 3].map((i) => (
                <ScrambledDocument key={i} index={i} tension={tension} refreshInterval={getNoiseSpeed()} />
              ))}
            </div>

            {/* Mobile: 2+1 */}
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              <div className="flex justify-center gap-4">
                {[1, 2].map((i) => (
                  <ScrambledDocument key={i} index={i} tension={tension} refreshInterval={getNoiseSpeed()} />
                ))}
              </div>
              <div className="flex justify-center">
                <ScrambledDocument index={3} tension={tension} refreshInterval={getNoiseSpeed()} />
              </div>
            </div>
          </div>
        </div>

        {/* Signal meter */}
        <div className="py-2">
          <SignalStrengthMeter tension={tension} />
        </div>

        {/* Bottom agent panel */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="enemy" />
        </div>
      </div>
    </div>
  );
}
