import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SlotMachineNumberProps {
  targetNumber: number;
  onComplete?: () => void;
  duration?: number;
  color?: 'green' | 'amber';
  size?: 'small' | 'medium' | 'large';
  autoStart?: boolean;
}

const fontSizes = {
  small: '2rem',
  medium: '4rem',
  large: '6rem',
};

const colors = {
  green: {
    main: '#00ff88',
    glow: '0 0 10px #00ff88, 0 0 20px #00ff88, 0 0 40px #00ff88',
  },
  amber: {
    main: '#ffaa00',
    glow: '0 0 10px #ffaa00, 0 0 20px #ffaa00, 0 0 40px #ffaa00',
  },
};

export function SlotMachineNumber({
  targetNumber,
  onComplete,
  duration: _duration = 1500,
  color = 'green',
  size = 'large',
  autoStart = true,
}: SlotMachineNumberProps) {
  // duration is kept for API compatibility but animation timing is fixed internally
  void _duration;
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'slowing' | 'landing' | 'complete'>('idle');
  const [displayNumber, setDisplayNumber] = useState(targetNumber);
  const [blur, setBlur] = useState(0);

  const startAnimation = useCallback(() => {
    setPhase('spinning');
    setBlur(4);

    // Phase 1: Fast spinning (0-800ms)
    let spinCount = 0;
    const spinInterval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 4) + 1);
      spinCount++;

      // Transition to slowing phase
      if (spinCount > 15) {
        clearInterval(spinInterval);
        setPhase('slowing');
        setBlur(2);

        // Phase 2: Slowing down (800-1200ms)
        let slowCount = 0;
        const slowInterval = setInterval(() => {
          // Gradually approach target number
          if (slowCount < 3) {
            setDisplayNumber(Math.floor(Math.random() * 4) + 1);
          } else {
            setDisplayNumber(targetNumber);
          }
          slowCount++;

          if (slowCount >= 5) {
            clearInterval(slowInterval);
            setPhase('landing');
            setBlur(0);
            setDisplayNumber(targetNumber);

            // Phase 3: Landing effect (1200-1500ms)
            setTimeout(() => {
              setPhase('complete');
              onComplete?.();
            }, 300);
          }
        }, 80);
      }
    }, 50);

    return () => {
      clearInterval(spinInterval);
    };
  }, [targetNumber, onComplete]);

  useEffect(() => {
    if (autoStart) {
      const cleanup = startAnimation();
      return cleanup;
    }
  }, [autoStart, startAnimation]);

  const colorConfig = colors[color];

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{
        fontFamily: "'VT323', 'Courier New', monospace",
        fontSize: fontSizes[size],
        minHeight: size === 'large' ? '120px' : size === 'medium' ? '80px' : '50px',
      }}
    >
      {/* Background glow effect during spinning */}
      {(phase === 'spinning' || phase === 'slowing') && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, ${colorConfig.main}20, transparent 70%)`,
          }}
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 0.2,
            repeat: Infinity,
          }}
        />
      )}

      {/* Main number display */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${displayNumber}-${phase}`}
          className="relative"
          initial={phase === 'spinning' ? { y: -30, opacity: 0 } : false}
          animate={{
            y: 0,
            opacity: 1,
            scale: phase === 'landing' ? [1, 1.15, 0.95, 1.05, 1] : 1,
            filter: `blur(${blur}px)`,
          }}
          exit={{ y: 30, opacity: 0 }}
          transition={{
            y: { duration: phase === 'spinning' ? 0.05 : 0.1 },
            scale: { duration: 0.3, ease: 'easeOut' },
            filter: { duration: 0.15 },
          }}
          style={{
            color: colorConfig.main,
            textShadow: phase === 'complete' || phase === 'landing' ? colorConfig.glow : `0 0 5px ${colorConfig.main}`,
          }}
        >
          {displayNumber}
        </motion.div>
      </AnimatePresence>

      {/* Landing flash effect */}
      {phase === 'landing' && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.2 }}
          style={{
            background: `radial-gradient(ellipse at center, ${colorConfig.main}60, transparent 60%)`,
          }}
        />
      )}

      {/* CRT scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: `repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 2px,
            rgba(0, 0, 0, 0.1) 2px,
            rgba(0, 0, 0, 0.1) 4px
          )`,
        }}
      />

      {/* Vertical scroll lines during spinning */}
      {(phase === 'spinning' || phase === 'slowing') && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom,
              transparent 0%,
              ${colorConfig.main}10 45%,
              ${colorConfig.main}30 50%,
              ${colorConfig.main}10 55%,
              transparent 100%
            )`,
          }}
          animate={{
            y: ['-100%', '100%'],
          }}
          transition={{
            duration: phase === 'spinning' ? 0.15 : 0.3,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}
    </div>
  );
}

/**
 * A row of slot machine numbers that animate in sequence
 */
interface SlotMachineRowProps {
  numbers: number[];
  onAllComplete?: () => void;
  staggerDelay?: number;
  color?: 'green' | 'amber';
  size?: 'small' | 'medium' | 'large';
}

export function SlotMachineRow({
  numbers,
  onAllComplete,
  staggerDelay = 200,
  color = 'green',
  size = 'large',
}: SlotMachineRowProps) {
  const [completedCount, setCompletedCount] = useState(0);
  const [startTimes, setStartTimes] = useState<boolean[]>([]);

  useEffect(() => {
    // Stagger the start of each number
    const timers: NodeJS.Timeout[] = [];

    numbers.forEach((_, index) => {
      const timer = setTimeout(() => {
        setStartTimes(prev => {
          const newTimes = [...prev];
          newTimes[index] = true;
          return newTimes;
        });
      }, index * staggerDelay);

      timers.push(timer);
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, [numbers, staggerDelay]);

  useEffect(() => {
    if (completedCount === numbers.length && numbers.length > 0) {
      onAllComplete?.();
    }
  }, [completedCount, numbers.length, onAllComplete]);

  return (
    <div className="flex items-center justify-center gap-4">
      {numbers.map((num, index) => (
        <div key={index} className="relative">
          {startTimes[index] ? (
            <SlotMachineNumber
              targetNumber={num}
              color={color}
              size={size}
              onComplete={() => setCompletedCount(c => c + 1)}
            />
          ) : (
            <div
              style={{
                fontFamily: "'VT323', 'Courier New', monospace",
                fontSize: fontSizes[size],
                color: '#1a2f1a',
                minHeight: size === 'large' ? '120px' : size === 'medium' ? '80px' : '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ?
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default SlotMachineNumber;
