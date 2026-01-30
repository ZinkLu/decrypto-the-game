import { ReactNode } from 'react';
import { rawColors } from '../theme/colors';

// Re-export from theme for backward compatibility
export { tensionConfig, type TensionLevel, colors } from '../theme/colors';

interface CRTContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Simplified CRT container - just wraps children without effects
 */
export function CRTContainer({
  children,
  className = '',
}: CRTContainerProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
    </div>
  );
}

/**
 * CRT panel component - simplified version with basic border
 */
interface CRTPanelProps {
  children: ReactNode;
  className?: string;
  borderColor?: string;
  background?: string;
}

export function CRTPanel({
  children,
  className = '',
  borderColor = rawColors.panel,
  background = rawColors.bgDark,
}: CRTPanelProps) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background,
        border: `2px solid ${borderColor}`,
      }}
    >
      {children}
    </div>
  );
}
