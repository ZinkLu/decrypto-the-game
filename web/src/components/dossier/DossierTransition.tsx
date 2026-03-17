import { useEffect, useState } from 'react';
import { transitionConfig, type TransitionRole } from '../../theme/colors';
import { rawColors } from '../../theme/colors';

export type { TransitionRole } from '../../theme/colors';

const roleLabels: Record<TransitionRole, string> = {
  encryptor: 'DISPATCHED',
  teammate: 'DECODING',
  opponent: 'INTERCEPTED',
};

interface DossierTransitionProps {
  role: TransitionRole;
  duration?: number;
  onComplete?: () => void;
}

export function DossierTransition({
  role,
  duration = 800,
  onComplete,
}: DossierTransitionProps) {
  const config = transitionConfig[role];
  const [isVisible, setIsVisible] = useState(true);
  const [stampVisible, setStampVisible] = useState(false);
  const label = roleLabels[role];

  useEffect(() => {
    // Show stamp after a short delay
    const stampTimer = setTimeout(() => setStampVisible(true), 150);

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

  const isEnemy = role === 'opponent';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: config.bgColor,
      }}
    >
      {/* Ink splatter / stamp effect background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${config.color} 0%, transparent 50%)`,
        }}
      />

      {/* Main content */}
      <div className="text-center relative z-10">
        {/* Stamp label */}
        {stampVisible && (
          <div
            className="inline-block mb-4"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '3rem',
              letterSpacing: '8px',
              color: config.color,
              border: `4px solid ${config.color}`,
              padding: '8px 32px',
              transform: `rotate(${isEnemy ? '3' : '-3'}deg)`,
              opacity: 0.9,
              animation: 'stamp-press 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {label}
          </div>
        )}

        {/* Subtitle text */}
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

export default DossierTransition;
