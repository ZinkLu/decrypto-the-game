import { rawColors } from '../theme/colors';

interface PhosphorTextProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'green' | 'amber' | 'red' | 'blue' | string;
  className?: string;
  'aria-hidden'?: boolean;
  role?: string;
}

const colorMap: Record<string, string> = {
  green: rawColors.crtPhosphor,
  amber: rawColors.crtAmber,
  red: rawColors.teamEnemy,
  blue: '#00aaff',
};

export function PhosphorText({
  text,
  size = 'medium',
  color = 'green',
  className = '',
  ...ariaProps
}: PhosphorTextProps) {
  const sizeClasses = {
    small: 'text-lg',
    medium: 'text-4xl',
    large: 'text-6xl',
  };

  const fontSizes = {
    small: '1.25rem',
    medium: '2.5rem',
    large: '4rem',
  };

  // Resolve color - support both preset names and custom colors
  const resolvedColor = colorMap[color] || color;

  return (
    <div
      className={`${sizeClasses[size]} font-bold font-mono ${className}`}
      style={{
        fontSize: fontSizes[size],
        fontFamily: "'VT323', 'Courier New', monospace",
        color: resolvedColor,
      }}
      {...ariaProps}
    >
      {text}
    </div>
  );
}

export default PhosphorText;
