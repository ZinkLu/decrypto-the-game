import { useState, useEffect, useMemo, useCallback } from 'react';
import { TensionLevel, rawColors, opponentMascotConfig } from '../theme/colors';
import { DeskClockTimer, RedactedText, RubberStamp, AgentPanel, DossierEffectLayer } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

type SlotState = 'waiting' | 'active' | 'completed';
type PhaseState = 'idle' | 'editing' | 'submitted';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface DerivedProgress {
  phase: PhaseState;
  step: number;
  focus: number;
}

function useEncryptProgress(): DerivedProgress {
  const { aiStatus, playerProgress } = useGameStore();
  if (aiStatus?.action === 'encrypt' && aiStatus.step >= 1 && aiStatus.step <= 3) {
    return { phase: 'editing', step: aiStatus.step - 1, focus: aiStatus.step };
  }
  if (playerProgress?.action === 'encrypt') {
    const phase = (playerProgress.state ?? 'idle') as PhaseState;
    return {
      phase,
      step: playerProgress.step ?? 0,
      focus: playerProgress.focus ?? 0,
    };
  }
  return { phase: 'idle', step: 0, focus: 0 };
}

function deriveSlotState(index1: number, progress: DerivedProgress): SlotState {
  if (progress.phase === 'submitted' || index1 <= progress.step) return 'completed';
  if (progress.phase === 'editing' && index1 === progress.focus) return 'active';
  return 'waiting';
}

// Scrambled doc — refresh speed and visual varies by state
function ScrambledDocument({ index, state, tension }: { index: number; state: SlotState; tension: TensionLevel }) {
  const CHARS = ['█', '▓', '░', '▒', '▮', '▯'];
  const ROWS = 3;
  const COLS = 10;
  const [grid, setGrid] = useState<string[][]>([]);

  const generate = useCallback(() => {
    const g: string[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = [];
      for (let c = 0; c < COLS; c++) row.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
      g.push(row);
    }
    return g;
  }, []);

  // refresh interval: active = fast, waiting = slow, completed = frozen
  const refreshInterval = useMemo(() => {
    if (state === 'completed') return 0;
    if (state === 'active') return tension === 'critical' ? 60 : 90;
    // waiting:
    return tension === 'critical' ? 300 : tension === 'tense' ? 400 : 500;
  }, [state, tension]);

  useEffect(() => {
    setGrid(generate());
    if (prefersReducedMotion || refreshInterval === 0) return;
    const timer = setInterval(() => setGrid(generate()), refreshInterval);
    return () => clearInterval(timer);
  }, [generate, refreshInterval]);

  // border / label per state
  const stateStyle = {
    waiting: {
      border: rawColors.opponentNormalBorder,
      textColor: rawColors.teamEnemy,
      label: 'SCANNING',
      animation: undefined,
    },
    active: {
      border: rawColors.teamEnemyLight,
      textColor: rawColors.tensionCriticalText,
      label: 'INCOMING',
      animation: prefersReducedMotion ? undefined : 'intercept-alarm 1s ease-in-out infinite',
    },
    completed: {
      border: rawColors.intelRed,
      textColor: rawColors.tensionCriticalText,
      label: 'CAPTURED',
      animation: undefined,
    },
  }[state];

  return (
    <div className="flex flex-col items-center">
      <div
        key={state}
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center overflow-hidden relative transition-[border-color] duration-300"
        style={{
          background: rawColors.opponentCrtScreen,
          border: `2px solid ${stateStyle.border}`,
          boxShadow: 'inset 0 0 15px rgba(139, 0, 0, 0.1)',
          animation: stateStyle.animation,
        }}
      >
        <pre
          className="text-xs leading-tight select-none"
          style={{
            fontFamily: "'Courier Prime', monospace",
            color: stateStyle.textColor,
            opacity: state === 'completed' ? 0.4 : state === 'active' ? 1 : 0.7,
          }}
        >
          {grid.map((row, i) => (
            <span key={i}>
              {row.join('')}
              {i < ROWS - 1 && '\n'}
            </span>
          ))}
        </pre>
        {state === 'completed' && !prefersReducedMotion && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ animation: 'intercept-stamp 0.55s ease-out 1' }}
          >
            <span
              className="px-2 py-0.5 text-xs font-bold"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: rawColors.intelRed,
                background: 'rgba(0,0,0,0.55)',
                border: `1.5px solid ${rawColors.intelRed}`,
                letterSpacing: '2px',
                transform: 'rotate(-4deg)',
              }}
            >
              INTERCEPTED
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <div
          className="text-sm"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: stateStyle.border, letterSpacing: '1px' }}
        >
          #{index}
        </div>
        <div
          className="text-xs"
          style={{ fontFamily: "'Courier Prime', monospace", color: stateStyle.textColor }}
        >
          {stateStyle.label}
        </div>
      </div>
    </div>
  );
}

// Signal strength — reflects activity level; stronger when encryptor editing
function SignalStrengthMeter({ activity }: { activity: 'low' | 'mid' | 'high' }) {
  const BARS = ['▂', '▄', '▆', '█'];
  const [bars, setBars] = useState<string[]>([]);

  useEffect(() => {
    const gen = () => Array.from({ length: 10 }, () => BARS[Math.floor(Math.random() * BARS.length)]);
    setBars(gen());
    if (prefersReducedMotion) return;
    const speed = activity === 'high' ? 100 : activity === 'mid' ? 250 : 500;
    const timer = setInterval(() => setBars(gen()), speed);
    return () => clearInterval(timer);
  }, [activity]);

  return (
    <div className="flex items-center justify-center gap-2">
      <span
        className="text-lg tracking-wider"
        style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemy }}
      >
        {bars.join('')}
      </span>
    </div>
  );
}

export default function OpponentWaiting() {
  const { encryptor, round, aiStatus } = useGameStore();
  void encryptor;
  void round;

  const progress = useEncryptProgress();
  const slotStates: SlotState[] = useMemo(
    () => [1, 2, 3].map((i) => deriveSlotState(i, progress)),
    [progress]
  );

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
      setTimeLeft((prev) => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
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

  const activity: 'low' | 'mid' | 'high' =
    progress.phase === 'idle' ? 'low'
      : progress.phase === 'editing' ? 'high'
        : 'mid';

  const isAIThinking = aiStatus?.action === 'encrypt';
  const defaultMascot = opponentMascotConfig[tension];
  void defaultMascot;
  const mascot = isAIThinking
    ? { emoji: '🤖', message: `Enemy AI composing intel... (${aiStatus!.step}/${aiStatus!.total})` }
    : progress.phase === 'idle'
      ? { emoji: '📡', message: 'Signal quiet... standing by' }
      : progress.phase === 'editing'
        ? { emoji: '⚠️', message: `Enemy drafting #${progress.focus} (${progress.step}/3 sent)` }
        : { emoji: '🚨', message: 'Transmission complete. Analyzing...' };

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, #0a0505 100%)` }}
    >
      <DossierEffectLayer />

      {tension === 'critical' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ background: 'rgba(139, 0, 0, 0.05)', animation: 'pulse-red 1s ease-in-out infinite' }}
        />
      )}

      <div className="relative z-10 h-full flex flex-col">
        <div className="flex flex-col items-center pt-4">
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="opponent" />
        </div>

        <div className="flex flex-col items-center mt-4 gap-2">
          <RubberStamp text="INTERCEPTED TRANSMISSION" color="red" size="small" rotation={-2} />

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
              <span
                className="text-[8px]"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}
              >
                UNKNOWN
              </span>
            </div>
          </div>

          <span
            className="text-sm tracking-widest"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemy, letterSpacing: '4px' }}
          >
            <RedactedText length={12} glitchSpeed={getNoiseSpeed()} />
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center mt-4 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg"
            style={{
              background: rawColors.opponentScreenBg,
              border: `2px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {slotStates.map((state, idx) => (
                <ScrambledDocument key={idx} index={idx + 1} state={state} tension={tension} />
              ))}
            </div>
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              <div className="flex justify-center gap-4">
                {slotStates.slice(0, 2).map((state, idx) => (
                  <ScrambledDocument key={idx} index={idx + 1} state={state} tension={tension} />
                ))}
              </div>
              <div className="flex justify-center">
                <ScrambledDocument index={3} state={slotStates[2]} tension={tension} />
              </div>
            </div>
          </div>
        </div>

        <div className="py-2">
          <SignalStrengthMeter activity={activity} />
        </div>

        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="enemy" />
        </div>
      </div>
    </div>
  );
}
