import { useState, useEffect, useMemo } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import { DeskClockTimer, AgentPanel, DossierEffectLayer } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

type SlotState = 'waiting' | 'active' | 'completed';
type PhaseState = 'idle' | 'editing' | 'submitted';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface DerivedProgress {
  phase: PhaseState;
  step: number;   // completed count 0-3
  focus: number;  // 1-3 if editing, 0 otherwise
}

// Merge human playerProgress and AI aiStatus into a single view-model
function useEncryptProgress(): DerivedProgress {
  const { aiStatus, playerProgress } = useGameStore();

  // AI fires ai_thinking with step=N meaning "working on slot N"
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

export default function TeammateWaiting() {
  const { encryptor, round, aiStatus } = useGameStore();
  void round;

  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');

  const encryptorName = encryptor || 'Teammate';
  const progress = useEncryptProgress();

  const slotStates: SlotState[] = useMemo(
    () => [1, 2, 3].map((i) => deriveSlotState(i, progress)),
    [progress]
  );

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
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
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

        {/* Mail slots */}
        <div className="flex-1 flex flex-col items-center mt-6 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg"
            style={{
              background: rawColors.navyLight,
              border: `2px solid ${rawColors.brassDim}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {slotStates.map((state, idx) => (
                <MailSlot key={idx} index={idx + 1} state={state} />
              ))}
            </div>
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              <div className="flex justify-center gap-4">
                {slotStates.slice(0, 2).map((state, idx) => (
                  <MailSlot key={idx} index={idx + 1} state={state} />
                ))}
              </div>
              <div className="flex justify-center">
                <MailSlot index={3} state={slotStates[2]} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom agent panel */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={getMascotEmoji()} message={getMascotMessage()} theme="friendly">
            <div
              className="text-xs mb-2"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color: rawColors.brassDim,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              [{completedCount}/3]
            </div>
          </AgentPanel>
        </div>
      </div>
    </div>
  );
}

function MailSlot({ index, state }: { index: number; state: SlotState }) {
  const styleByState = {
    waiting: {
      bg: rawColors.navyDark,
      border: rawColors.navyLight,
      icon: '📪',
      iconColor: rawColors.navyLight,
      label: 'Waiting',
      labelColor: rawColors.navyLight,
    },
    active: {
      bg: `${rawColors.brass}10`,
      border: rawColors.brass,
      icon: '📨',
      iconColor: rawColors.brass,
      label: 'Typing',
      labelColor: rawColors.brass,
    },
    completed: {
      bg: `${rawColors.teamFriendly}15`,
      border: rawColors.teamFriendly,
      icon: '📄',
      iconColor: rawColors.teamFriendly,
      label: 'Received',
      labelColor: rawColors.teamFriendly,
    },
  }[state];

  const animations = prefersReducedMotion
    ? {}
    : {
        waiting: { animation: 'slot-idle-breathe 2.4s ease-in-out infinite' },
        active: { animation: 'slot-active-glow 1.2s ease-in-out infinite' },
        completed: { animation: 'slot-completed-glow 1.4s ease-out 1' },
      }[state];

  const iconAnim = prefersReducedMotion
    ? undefined
    : state === 'active'
      ? 'slot-active-jiggle 0.9s ease-in-out infinite'
      : state === 'completed'
        ? 'slot-completed-seal 0.6s ease-out 1'
        : undefined;

  return (
    <div className="flex flex-col items-center">
      <div
        key={state /* remount on state change → re-run one-shot animations */}
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center transition-[background,border-color] duration-500 relative"
        style={{
          background: styleByState.bg,
          border: `2px solid ${styleByState.border}`,
          ...animations,
        }}
      >
        <div className="flex flex-col items-center">
          <span
            className="text-2xl"
            style={{ color: styleByState.iconColor, animation: iconAnim }}
          >
            {styleByState.icon}
          </span>
          {state === 'active' && !prefersReducedMotion && (
            <span
              className="text-base mt-1 flex gap-0.5"
              aria-hidden
            >
              <span style={{ color: rawColors.brass, animation: 'typing-dot 1.2s infinite 0s' }}>·</span>
              <span style={{ color: rawColors.brass, animation: 'typing-dot 1.2s infinite 0.2s' }}>·</span>
              <span style={{ color: rawColors.brass, animation: 'typing-dot 1.2s infinite 0.4s' }}>·</span>
            </span>
          )}
          {state === 'completed' && (
            <span
              className="text-xs mt-1"
              style={{ fontFamily: "'Courier Prime', monospace", color: styleByState.iconColor }}
            >
              ✓
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 text-center">
        <div
          className="text-sm"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            color: styleByState.border,
            letterSpacing: '1px',
          }}
        >
          #{index}
        </div>
        <div
          className="text-xs opacity-70"
          style={{ fontFamily: "'Courier Prime', monospace", color: styleByState.labelColor }}
        >
          {styleByState.label}
        </div>
      </div>
    </div>
  );
}
