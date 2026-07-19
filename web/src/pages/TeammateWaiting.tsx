import { useMemo } from 'react';
import { rawColors } from '../theme/colors';
import { DeskClockTimer, AgentPanel, DossierEffectLayer, SignalOscilloscope } from '../components/dossier';
import { useGameStore } from '../store/gameStore';
import { useCountdown } from '../hooks/useCountdown';
import { useReducedMotion } from '../hooks/useReducedMotion';

type SlotState = 'waiting' | 'active' | 'completed';
type PhaseState = 'idle' | 'editing' | 'submitted';

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
    label: 'Waiting',
    border: rawColors.brassDim,
    bg: 'transparent',
    textColor: rawColors.brassDim,
  },
  active: {
    label: 'Incoming',
    border: rawColors.brass,
    bg: `${rawColors.brass}10`,
    textColor: rawColors.brass,
  },
  completed: {
    label: 'Received',
    border: rawColors.teamFriendly,
    bg: `${rawColors.teamFriendly}10`,
    textColor: rawColors.teamFriendly,
  },
} as const;

function IntelStatusRow({ index, state }: { index: number; state: SlotState }) {
  const prefersReducedMotion = useReducedMotion();
  const cfg = STATE_CONFIG[state];

  const rowAnim = prefersReducedMotion
    ? undefined
    : state === 'active'
      ? 'slot-active-glow 1.2s ease-in-out infinite'
      : state === 'completed'
        ? 'slot-completed-glow 1.4s ease-out 1'
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
      <div className="flex flex-col items-start shrink-0" style={{ width: '88px' }}>
        <span
          className="text-xs"
          style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
        >
          INTEL #{index}
        </span>
        <span
          className="text-base"
          style={{ fontFamily: "'Bebas Neue', sans-serif", color: cfg.textColor, letterSpacing: '1px' }}
        >
          {cfg.label.toUpperCase()}
        </span>
      </div>

      <SignalOscilloscope state={state} theme="friendly" width={104} height={48} />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {state === 'active' && !prefersReducedMotion ? (
          <span className="flex gap-0.5" aria-label="typing">
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0s' }}>·</span>
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0.2s' }}>·</span>
            <span className="text-xl" style={{ color: cfg.textColor, animation: 'typing-dot 1.2s infinite 0.4s' }}>·</span>
          </span>
        ) : state === 'completed' ? (
          <span
            className="text-sm"
            style={{ fontFamily: "'Courier Prime', monospace", color: cfg.textColor }}
          >
            intel secured
          </span>
        ) : (
          <span
            className="text-sm italic"
            style={{ fontFamily: "'Courier Prime', monospace", color: cfg.textColor, opacity: 0.7 }}
          >
            awaiting transmission
          </span>
        )}
      </div>

      {state === 'completed' && (
        <span className="text-lg shrink-0" style={{ color: cfg.textColor }}>✓</span>
      )}
    </div>
  );
}

export default function TeammateWaiting() {
  const { encryptor, aiStatus } = useGameStore();

  const { timeLeft, tension } = useCountdown({ totalSeconds: 90 });

  const encryptorName = encryptor || 'Teammate';
  const progress = useEncryptProgress();

  const slotStates: SlotState[] = useMemo(
    () => [1, 2, 3].map((i) => deriveSlotState(i, progress)),
    [progress]
  );

  const isAIThinking = aiStatus?.action === 'encrypt';
  const completedCount = slotStates.filter((s) => s === 'completed').length;

  const getMascotMessage = () => {
    if (isAIThinking) return `${encryptorName} is thinking... (${aiStatus!.step}/${aiStatus!.total})`;
    if (progress.phase === 'idle') return 'Awaiting transmission...';
    if (progress.phase === 'submitted') return 'All intel received!';
    if (completedCount === 0) return `${encryptorName} is drafting...`;
    if (completedCount === 1) return 'First intel received!';
    if (completedCount === 2) return 'Almost all received!';
    return 'All intel received!';
  };

  const getMascotEmoji = () => {
    if (isAIThinking) return '🤖';
    if (progress.phase === 'idle') return '🕰️';
    if (completedCount === 0) return '📨';
    if (completedCount === 1) return '📬';
    if (completedCount === 2) return '📭';
    return '✅';
  };

  const getBgColor = () => {
    switch (tension) {
      case 'normal': return rawColors.tensionNormalBg;
      case 'warning': return rawColors.tensionWarningBg;
      case 'tense': return rawColors.tensionTenseBg;
      case 'critical': return rawColors.tensionCriticalBg;
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${getBgColor()} 0%, ${rawColors.bgDark} 100%)` }}
    >
      <DossierEffectLayer />

      <div className="relative z-10 h-full flex flex-col">
        {/* Countdown */}
        <div className="flex flex-col items-center pt-6">
          <DeskClockTimer timeLeft={timeLeft} totalSeconds={90} tension={tension} showProgressBar={true} size="medium" />
        </div>

        {/* Encryptor info */}
        <div className="flex flex-col items-center mt-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${rawColors.brassLight}, ${rawColors.brass})`,
                border: `2px solid ${rawColors.brassDim}`,
              }}
            >
              <span className="text-lg" style={{ color: rawColors.navyDark }}>🕵️</span>
            </div>
            <span
              className="text-lg"
              style={{ fontFamily: "'Special Elite', cursive", color: rawColors.cream }}
            >
              {encryptorName} is composing intel...
            </span>
          </div>
        </div>

        {/* Intel status list */}
        <div className="flex-1 px-4 mt-4 overflow-y-auto">
          <div
            className="max-w-lg mx-auto p-3 rounded-lg"
            style={{ background: rawColors.navyLight, border: `1px solid ${rawColors.brassDim}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs"
                style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim }}
              >
                INCOMING INTEL [{completedCount}/3]
              </span>
            </div>
            <div className="space-y-2">
              {slotStates.map((state, idx) => (
                <IntelStatusRow key={idx} index={idx + 1} state={state} />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom agent panel */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={getMascotEmoji()} message={getMascotMessage()} theme="friendly" />
        </div>
      </div>
    </div>
  );
}
