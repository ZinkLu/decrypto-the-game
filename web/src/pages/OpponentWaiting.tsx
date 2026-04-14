import { useState, useEffect, useMemo } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
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

const STATE_CONFIG = {
  waiting: {
    emoji: '🔍',
    label: 'Scanning',
    border: rawColors.opponentNormalBorder,
    bg: 'transparent',
    textColor: rawColors.teamEnemyDim,
  },
  active: {
    emoji: '📡',
    label: 'Incoming',
    border: rawColors.intelRed,
    bg: `${rawColors.intelRed}12`,
    textColor: rawColors.tensionCriticalText,
  },
  completed: {
    emoji: '🔒',
    label: 'Captured',
    border: rawColors.teamEnemyLight,
    bg: `${rawColors.intelRed}18`,
    textColor: rawColors.tensionCriticalText,
  },
} as const;

function InterceptRow({ index, state }: { index: number; state: SlotState }) {
  const cfg = STATE_CONFIG[state];

  const iconAnim = prefersReducedMotion
    ? undefined
    : state === 'waiting'
      ? 'slot-idle-breathe 2.4s ease-in-out infinite'
      : state === 'active'
        ? 'slot-active-jiggle 0.9s ease-in-out infinite'
        : 'slot-completed-seal 0.6s ease-out 1';

  const rowAnim = prefersReducedMotion
    ? undefined
    : state === 'active'
      ? 'intercept-alarm 1s ease-in-out infinite'
      : undefined;

  return (
    <div
      key={state}
      className="flex items-center gap-3 py-2 px-3 rounded transition-[background,border-color] duration-300"
      style={{
        background: cfg.bg,
        borderLeft: `3px solid ${cfg.border}`,
        animation: rowAnim,
      }}
    >
      <div className="flex flex-col items-start shrink-0" style={{ width: '96px' }}>
        <span
          className="text-xs"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}
        >
          INTERCEPT #{index}
        </span>
        <span
          className="text-base"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            color: cfg.textColor,
            letterSpacing: '2px',
          }}
        >
          {cfg.label.toUpperCase()}
        </span>
      </div>

      <span className="text-sm shrink-0" style={{ color: rawColors.teamEnemyDim }}>→</span>

      <div
        className="flex items-center justify-center rounded shrink-0"
        style={{
          width: '48px',
          height: '48px',
          background: rawColors.opponentCrtScreen,
          border: `1px solid ${cfg.border}`,
          boxShadow: state === 'active' ? 'inset 0 0 10px rgba(196,30,58,0.3)' : undefined,
        }}
      >
        <span className="text-2xl" style={{ animation: iconAnim }}>{cfg.emoji}</span>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {state === 'active' && !prefersReducedMotion ? (
          <span className="flex gap-0.5" aria-label="tracking">
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0s' }}>·</span>
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0.2s' }}>·</span>
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0.4s' }}>·</span>
            <span
              className="text-xs ml-1 tracking-wider"
              style={{ fontFamily: "'Courier Prime', monospace", color: cfg.textColor }}
            >
              TRACKING
            </span>
          </span>
        ) : state === 'completed' ? (
          <span
            className="text-sm tracking-widest"
            style={{ fontFamily: "'Courier Prime', monospace", color: cfg.textColor }}
          >
            INTERCEPTED
          </span>
        ) : (
          <span
            className="text-sm italic"
            style={{ fontFamily: "'Courier Prime', monospace", color: cfg.textColor, opacity: 0.7 }}
          >
            listening...
          </span>
        )}
      </div>

      {state === 'completed' && (
        <span className="text-lg shrink-0" style={{ color: cfg.textColor }}>◉</span>
      )}
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

  const isAIThinking = aiStatus?.action === 'encrypt';
  const capturedCount = slotStates.filter((s) => s === 'completed').length;

  const mascot = isAIThinking
    ? { emoji: '🤖', message: `Enemy AI composing intel... (${aiStatus!.step}/${aiStatus!.total})` }
    : progress.phase === 'idle'
      ? { emoji: '📡', message: 'Signal quiet... standing by' }
      : progress.phase === 'editing'
        ? { emoji: '⚠️', message: `Enemy drafting #${progress.focus} (${progress.step}/3 captured)` }
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

        <div className="flex flex-col items-center mt-3 gap-1">
          <RubberStamp text="INTERCEPTED TRANSMISSION" color="red" size="small" rotation={-2} />

          <div className="flex items-center gap-3 mt-1">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: rawColors.opponentCrtScreen,
                border: `2px solid ${rawColors.opponentNormalBorder}`,
                boxShadow: '0 0 10px rgba(139, 0, 0, 0.2)',
              }}
            >
              <span className="text-lg" style={{ color: rawColors.teamEnemy }}>?</span>
            </div>
            <span
              className="text-sm tracking-widest"
              style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemy, letterSpacing: '4px' }}
            >
              <RedactedText length={10} glitchSpeed={getNoiseSpeed()} />
            </span>
          </div>
        </div>

        {/* Intercept status list */}
        <div className="flex-1 px-4 mt-4 overflow-y-auto">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{
              background: rawColors.opponentScreenBg,
              border: `1px solid ${rawColors.opponentNormalBorder}`,
              boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs tracking-widest"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.teamEnemyDim }}
              >
                INTERCEPT FEED [{capturedCount}/3]
              </span>
            </div>
            <div className="space-y-2">
              {slotStates.map((state, idx) => (
                <InterceptRow key={idx} index={idx + 1} state={state} />
              ))}
            </div>
          </div>
        </div>

        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="enemy" />
        </div>
      </div>
    </div>
  );
}
