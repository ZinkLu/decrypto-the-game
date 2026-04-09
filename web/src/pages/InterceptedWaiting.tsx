import { useState, useEffect, useRef } from 'react';
import { TensionLevel, rawColors, alertTensionConfig } from '../theme/colors';
import { DeskClockTimer, RubberStamp, AgentPanel, DossierEffectLayer } from '../components/dossier';
import { useGameStore } from '../store/gameStore';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface CodeWord {
  number: number;
  word: string;
}

// Scanning target with crosshair lock and sweep line
function ScanningTarget({ scanSpeed }: { scanSpeed: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-20 h-20 rounded-lg flex items-center justify-center overflow-hidden"
        style={{
          background: `${rawColors.intelRed}10`,
          border: `2px solid ${rawColors.intelRed}`,
        }}
      >
        {/* Crosshair marks */}
        <span className="absolute top-1 left-1 text-xs" style={{ color: rawColors.teamEnemy }}>╳</span>
        <span className="absolute top-1 right-1 text-xs" style={{ color: rawColors.teamEnemy }}>╳</span>
        <span className="absolute bottom-1 left-1 text-xs" style={{ color: rawColors.teamEnemy }}>╳</span>
        <span className="absolute bottom-1 right-1 text-xs" style={{ color: rawColors.teamEnemy }}>╳</span>

        {/* Lock icon */}
        <span className="text-2xl relative z-10">🔒</span>

        {/* Scan line */}
        {!prefersReducedMotion && (
          <div
            className="absolute left-0 right-0 h-[2px] pointer-events-none"
            style={{
              background: `${rawColors.intelRed}4D`,
              animation: `scan-line ${scanSpeed}s linear infinite`,
            }}
          />
        )}
      </div>

      <span
        className="text-sm"
        style={{
          fontFamily: "'Courier Prime', monospace",
          color: rawColors.intelRed,
        }}
      >
        Under Analysis
      </span>
    </div>
  );
}

// Code word slot showing the team's words under threat
function CodeWordSlot({ codeword, isFlashing }: { codeword: CodeWord; isFlashing: boolean }) {
  return (
    <div
      className="flex flex-col items-center p-2 lg:p-3 rounded relative"
      style={{
        background: rawColors.bgPaper,
        border: `2px solid ${rawColors.creamDark}`,
        boxShadow: '2px 2px 4px rgba(0,0,0,0.2)',
        minWidth: '60px',
        animation: isFlashing && !prefersReducedMotion ? 'card-flash 1.5s ease-in-out' : 'none',
      }}
    >
      <span
        className="text-xl lg:text-2xl font-bold"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.brass }}
      >
        {codeword.number}
      </span>
      <span
        className="text-sm lg:text-base mt-1"
        style={{ fontFamily: "'Noto Serif SC', serif", color: rawColors.inkBlack }}
      >
        {codeword.word}
      </span>

      {/* Scan interference bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: `${rawColors.intelRed}80`,
          animation: !prefersReducedMotion ? 'pulse-red 2s ease-in-out infinite' : 'none',
        }}
      />
    </div>
  );
}

// Threat level meter
function ThreatMeter({ level }: { level: number }) {
  const TOTAL = 8;
  const filled = Math.min(level, TOTAL);

  return (
    <div className="flex items-center justify-center gap-3">
      <span
        className="text-xs tracking-widest"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: rawColors.teamEnemy, letterSpacing: '2px' }}
      >
        THREAT LEVEL:
      </span>
      <span style={{ fontFamily: "'Courier Prime', monospace", color: rawColors.intelRed, letterSpacing: '1px' }}>
        {'█'.repeat(filled)}{'░'.repeat(TOTAL - filled)}
      </span>
    </div>
  );
}

export default function InterceptedWaiting() {
  const { myWords, round, aiStatus, playerProgress } = useGameStore();
  void round;

  const [timeLeft, setTimeLeft] = useState(45);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [threatLevel, setThreatLevel] = useState(2);
  const [flashingCard, setFlashingCard] = useState(-1);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const flashTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const codewords: CodeWord[] = myWords.map((word, i) => ({ number: i + 1, word }));

  // Derive intercept progress from AI or human events
  const interceptStep = (aiStatus?.action === 'intercept' ? aiStatus.step : 0)
    || (playerProgress?.action === 'intercept' ? playerProgress.step : 0);

  useEffect(() => {
    setOpponentProgress((prev) => Math.max(prev, interceptStep));
    setThreatLevel(2 + Math.max(opponentProgress, interceptStep) * 2);
  }, [interceptStep]);

  useEffect(() => {
    if (timeLeft > 15) setTension('normal');
    else if (timeLeft > 8) setTension('warning');
    else if (timeLeft > 3) setTension('tense');
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

  // Random card flash effect
  useEffect(() => {
    const speed = tension === 'warning' || tension === 'tense' || tension === 'critical' ? 2000 : 3000;
    flashTimerRef.current = setInterval(() => {
      const idx = Math.floor(Math.random() * codewords.length);
      setFlashingCard(idx);
      setTimeout(() => setFlashingCard(-1), 1500);
    }, speed);
    return () => clearInterval(flashTimerRef.current);
  }, [tension]);

  const tensionCfg = alertTensionConfig[tension];

  const isAIThinking = aiStatus?.action === 'intercept';

  const getMascot = () => {
    if (isAIThinking) return { emoji: '🤖', message: `AI analyzing your intel... (${aiStatus!.step}/${aiStatus!.total})` };
    if (tension === 'critical') return { emoji: tensionCfg.emoji, message: tensionCfg.message };
    if (tension === 'tense') return { emoji: tensionCfg.emoji, message: tensionCfg.message };
    if (opponentProgress === 0) return { emoji: '😰', message: 'Comms exposed...' };
    if (opponentProgress === 1) return { emoji: '😓', message: 'They\'re analyzing...' };
    if (opponentProgress === 2) return { emoji: '😨', message: 'Almost cracked...' };
    return { emoji: '🫣', message: 'Awaiting intercept result...' };
  };

  const mascot = getMascot();

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, ${tensionCfg.bg} 0%, ${rawColors.bgDark} 100%)` }}
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
          <DeskClockTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" theme="alert" />
        </div>

        {/* Warning stamp */}
        <div className="flex justify-center mt-3">
          <RubberStamp text="COMMUNICATION COMPROMISED" color="red" size="small" rotation={-2} animated />
        </div>

        {/* Scanning target + code words area */}
        <div className="flex-1 flex flex-col items-center mt-4 px-4">
          <div
            className="w-full max-w-4xl p-4 rounded-lg"
            style={{
              background: rawColors.navyDark,
              border: `2px dashed ${rawColors.intelRed}`,
              boxShadow: 'inset 0 0 40px rgba(139, 0, 0, 0.15)',
            }}
          >
            {/* Scanning target */}
            <div className="flex justify-center py-3">
              <ScanningTarget scanSpeed={tensionCfg.scanSpeed} />
            </div>

            {/* Code word slots - Desktop: 3+1 */}
            <div className="hidden lg:flex flex-col items-center gap-4 py-3">
              <div className="flex justify-center gap-6">
                {codewords.slice(0, 3).map((cw, i) => (
                  <CodeWordSlot key={cw.number} codeword={cw} isFlashing={flashingCard === i} />
                ))}
              </div>
              <div className="flex justify-center">
                <CodeWordSlot codeword={codewords[3]} isFlashing={flashingCard === 3} />
              </div>
            </div>

            {/* Code word slots - Mobile: 2×2 */}
            <div className="lg:hidden grid grid-cols-2 gap-3 py-3 max-w-xs mx-auto">
              {codewords.map((cw, i) => (
                <CodeWordSlot key={cw.number} codeword={cw} isFlashing={flashingCard === i} />
              ))}
            </div>
          </div>
        </div>

        {/* Threat meter */}
        <div className="py-2">
          <ThreatMeter level={threatLevel} />
        </div>

        {/* Bottom agent panel */}
        <div className="pb-4 px-4">
          <AgentPanel emoji={mascot.emoji} message={mascot.message} theme="alert" />
        </div>
      </div>
    </div>
  );
}
