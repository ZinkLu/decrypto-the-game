import { useEffect, useState } from 'react';
import { transitionConfig, type TransitionRole } from '../theme/colors';

// Re-export for backward compatibility
export type { TransitionRole } from '../theme/colors';

// Role icon mapping
const roleIcons: Record<TransitionRole, string> = {
  encryptor: '🔐',
  teammate: '📡',
  opponent: '🎯',
};

interface TransitionOverlayProps {
  role: TransitionRole;
  duration?: number;
  onComplete?: () => void;
}

/**
 * Simplified transition overlay component
 * Shows role icon and text, then calls onComplete after duration
 */
export function TransitionOverlay({
  role,
  duration = 800,
  onComplete,
}: TransitionOverlayProps) {
  const config = transitionConfig[role];
  const [isVisible, setIsVisible] = useState(true);
  const icon = roleIcons[role];

  // Transition complete callback
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: config.bgColor,
      }}
    >
      {/* Main content */}
      <div className="text-center relative z-10">
        {/* Role icon */}
        <div className="mb-4">
          <span className="text-5xl">
            {icon}
          </span>
        </div>

        {/* Text */}
        <div
          className="text-4xl font-bold font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
            minHeight: '1.5em',
          }}
        >
          {config.text}
        </div>

        {/* Loading dots */}
        <div
          className="mt-4 flex justify-center gap-2"
          style={{ color: config.color }}
        >
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </div>
      </div>

      {/* Corner decorations */}
      <div
        className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2"
        style={{ borderColor: config.color, opacity: 0.5 }}
      />
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
  bgColor = '#0a0f0a',
}: TransitionPageProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0"
      style={{ background: bgColor }}
    >
      {children}
    </div>
  );
}

export default TransitionOverlay;
