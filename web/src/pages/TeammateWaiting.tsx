import { useState, useEffect } from 'react';
import { TensionLevel, rawColors } from '../theme/colors';
import { DeskClockTimer, AgentPanel, DossierEffectLayer } from '../components/dossier';

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

  const encryptorName = '小明';

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

  // Simulate mail slots receiving
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setWaveforms((prev) => prev.map((w) => w.id === 1 ? { ...w, state: 'completed' as const, statusText: '已接收' } : w));
      setCompletedCount(1);
    }, 5000);
    const timer2 = setTimeout(() => {
      setWaveforms((prev) => prev.map((w) => w.id === 2 ? { ...w, state: 'completed' as const, statusText: '已接收' } : w));
      setCompletedCount(2);
    }, 10000);
    const timer3 = setTimeout(() => {
      setWaveforms((prev) => prev.map((w) => w.id === 3 ? { ...w, state: 'completed' as const, statusText: '已接收' } : w));
      setCompletedCount(3);
    }, 15000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  const getMascotMessage = () => {
    if (completedCount === 0) return '等待情报传达…';
    if (completedCount === 1) return '收到第一份情报!';
    if (completedCount === 2) return '即将全部到达!';
    return '情报全部就位!';
  };

  const getMascotEmoji = () => {
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
              {encryptorName} 正在编写情报…
            </span>
          </div>
        </div>

        {/* Mail slots area */}
        <div className="flex-1 flex flex-col items-center mt-6 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg"
            style={{
              background: rawColors.navyLight,
              border: `2px solid ${rawColors.brassDim}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {/* Desktop: 3 columns */}
            <div className="hidden lg:flex justify-center gap-8 py-4">
              {waveforms.map((waveform) => (
                <MailSlot key={waveform.id} index={waveform.id} state={waveform.state} statusText={waveform.statusText} />
              ))}
            </div>

            {/* Mobile: 2+1 layout */}
            <div className="lg:hidden flex flex-col items-center gap-4 py-4">
              <div className="flex justify-center gap-4">
                {waveforms.slice(0, 2).map((waveform) => (
                  <MailSlot key={waveform.id} index={waveform.id} state={waveform.state} statusText={waveform.statusText} />
                ))}
              </div>
              <div className="flex justify-center">
                {waveforms.slice(2, 3).map((waveform) => (
                  <MailSlot key={waveform.id} index={waveform.id} state={waveform.state} statusText={waveform.statusText} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom agent panel */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={getMascotEmoji()} message={getMascotMessage()} theme="friendly">
            <div
              className="text-xs mb-2"
              style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.brassDim, fontVariantNumeric: 'tabular-nums' }}
            >
              [{completedCount}/3]
            </div>
          </AgentPanel>
        </div>
      </div>
    </div>
  );
}

// Mail slot component (replaces waveform status indicator)
function MailSlot({ index, state, statusText }: { index: number; state: 'active' | 'completed' | 'waiting'; statusText: string }) {
  const getStyles = () => {
    switch (state) {
      case 'completed':
        return { bg: `${rawColors.teamFriendly}15`, border: rawColors.teamFriendly, icon: '✓', iconColor: rawColors.teamFriendly };
      case 'active':
        return { bg: `${rawColors.brass}10`, border: rawColors.brass, icon: '…', iconColor: rawColors.brass };
      case 'waiting':
      default:
        return { bg: rawColors.navyDark, border: rawColors.navyLight, icon: '—', iconColor: rawColors.navyLight };
    }
  };

  const s = getStyles();

  return (
    <div className="flex flex-col items-center">
      {/* Slot */}
      <div
        className="w-36 h-20 lg:w-48 lg:h-24 rounded flex items-center justify-center transition-all duration-500"
        style={{
          background: s.bg,
          border: `2px solid ${s.border}`,
          boxShadow: state === 'completed' ? `0 0 10px ${rawColors.teamFriendly}30` : 'inset 0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        {state === 'completed' ? (
          <div className="flex flex-col items-center">
            <span className="text-2xl" style={{ color: s.iconColor }}>📄</span>
            <span className="text-xs mt-1" style={{ fontFamily: "'Courier Prime', monospace", color: s.iconColor }}>✓</span>
          </div>
        ) : state === 'active' ? (
          <span className="text-2xl" style={{ color: s.iconColor, animation: 'pulse-red 2s ease-in-out infinite' }}>📨</span>
        ) : (
          <span className="text-2xl" style={{ color: s.iconColor }}>📪</span>
        )}
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <div className="text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif", color: s.border, letterSpacing: '1px' }}>
          #{index}
        </div>
        <div className="text-xs opacity-70" style={{ fontFamily: "'Courier Prime', monospace", color: s.border }}>
          {statusText}
        </div>
      </div>
    </div>
  );
}
