import { rawColors } from '../../theme/colors';

interface WaxSealProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeMap = {
  small: 32,
  medium: 48,
  large: 64,
};

export function WaxSeal({ size = 'medium', className = '' }: WaxSealProps) {
  const s = sizeMap[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width: s,
        height: s,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${rawColors.teamEnemyLight}, ${rawColors.teamEnemy}, ${rawColors.teamEnemyDim})`,
        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.15), 0 2px 6px rgba(0,0,0,0.5)`,
      }}
      aria-hidden="true"
    >
      {/* Embossed letter */}
      <span
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: s * 0.45,
          color: rawColors.teamEnemyDim,
          textShadow: '0 1px 1px rgba(255,255,255,0.2)',
        }}
      >
        D
      </span>
    </div>
  );
}

export default WaxSeal;
