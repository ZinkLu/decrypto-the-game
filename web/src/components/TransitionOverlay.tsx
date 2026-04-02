import { useEffect, useState } from 'react';
import { transitionConfig, type TransitionRole } from '../theme/colors';
import { rawColors } from '../theme/colors';

// Re-export for backward compatibility
export type { TransitionRole } from '../theme/colors';

// Role stamp labels
const roleLabels: Record<TransitionRole, string> = {
  encryptor: 'DISPATCHED',
  teammate: 'DECODING',
  opponent: 'INTERCEPTED',
  // B2C Branch A: opponent intercepts
  alert: 'ALERT',
  intercepting: 'INTERCEPTING',
  // B2C Branch B: opponent skips
  secure: 'SECURE',
  passed: 'PASSED',
};

interface TransitionOverlayProps {
  role: TransitionRole;
  duration?: number;
  onComplete?: () => void;
}

/**
 * Stamp-slam transition overlay
 * Shows a large rubber stamp effect then calls onComplete
 */
export function TransitionOverlay({
  role,
  duration = 800,
  onComplete,
}: TransitionOverlayProps) {
  const config = transitionConfig[role];
  const [isVisible, setIsVisible] = useState(true);
  const [stampVisible, setStampVisible] = useState(false);
  const label = roleLabels[role];
  const isEnemy = role === 'opponent' || role === 'alert' || role === 'intercepting' || role === 'passed';

  useEffect(() => {
    const stampTimer = setTimeout(() => setStampVisible(true), 100);
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => {
      clearTimeout(timer);
      clearTimeout(stampTimer);
    };
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: config.bgColor }}
    >
      {/* Radial ink effect */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${config.color} 0%, transparent 50%)`,
        }}
      />

      {/* Main content */}
      <div className="text-center relative z-10">
        {/* Stamp */}
        {stampVisible && (
          <div
            className="inline-block mb-4"
            style={{
              fontFamily: "'Bebas Neue', 'Impact', sans-serif",
              fontSize: '3rem',
              letterSpacing: '8px',
              color: config.color,
              border: `4px solid ${config.color}`,
              padding: '8px 32px',
              transform: `rotate(${config.rotation}deg)`,
              opacity: 0.9,
              animation: 'stamp-press 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {label}
          </div>
        )}

        {/* Text */}
        <div
          className="text-lg"
          style={{
            fontFamily: "'Special Elite', cursive",
            color: isEnemy ? rawColors.teamEnemyLight : rawColors.cream,
            opacity: 0.7,
          }}
        >
          {config.text}
        </div>
      </div>
    </div>
  );
}

/**
 * Transition controller Hook
 */
export function useTransition(role: TransitionRole, onTransitionEnd?: () => void) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetPage, setTargetPage] = useState<string | null>(null);

  const showTransition = () => {
    setIsTransitioning(true);
  };

  const transitionTo = (page: string) => {
    setTargetPage(page);
    setIsTransitioning(true);
  };

  const handleComplete = () => {
    onTransitionEnd?.();
    if (targetPage) {
      console.log('Transition to:', targetPage);
    }
  };

  return {
    isTransitioning,
    showTransition,
    transitionTo,
    handleComplete,
    role,
  };
}

/**
 * Page container with transition
 */
interface TransitionPageProps {
  children: React.ReactNode;
  isVisible: boolean;
  bgColor?: string;
}

export function TransitionPage({
  children,
  isVisible,
  bgColor = '#060A14',
}: TransitionPageProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0" style={{ background: bgColor }}>
      {children}
    </div>
  );
}

export default TransitionOverlay;
