import { rawColors } from '../../theme/colors';

interface RubberStampProps {
  text: string;
  color?: 'red' | 'blue' | 'green';
  size?: 'small' | 'medium' | 'large';
  rotation?: number;
  className?: string;
  animated?: boolean;
}

const colorMap = {
  red: rawColors.intelRed,
  blue: rawColors.inkBlue,
  green: rawColors.teamFriendly,
};

const sizeMap = {
  small: { fontSize: '0.875rem', padding: '2px 10px', borderWidth: '2px', letterSpacing: '2px' },
  medium: { fontSize: '1.25rem', padding: '4px 16px', borderWidth: '3px', letterSpacing: '4px' },
  large: { fontSize: '1.75rem', padding: '6px 24px', borderWidth: '4px', letterSpacing: '6px' },
};

export function RubberStamp({
  text,
  color = 'red',
  size = 'medium',
  rotation = -3,
  className = '',
  animated = false,
}: RubberStampProps) {
  const resolvedColor = colorMap[color];
  const sizeStyle = sizeMap[size];

  return (
    <span
      className={`inline-block ${className}`}
      style={{
        fontFamily: "'Bebas Neue', 'Impact', sans-serif",
        textTransform: 'uppercase',
        color: resolvedColor,
        border: `${sizeStyle.borderWidth} solid ${resolvedColor}`,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        letterSpacing: sizeStyle.letterSpacing,
        transform: `rotate(${rotation}deg)`,
        opacity: 0.85,
        // Rough stamp edge effect via SVG filter
        filter: 'url(#stamp-rough)',
        animation: animated ? 'stamp-press 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
      }}
    >
      {/* SVG filter for rough edges */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="stamp-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      {text}
    </span>
  );
}

export default RubberStamp;
