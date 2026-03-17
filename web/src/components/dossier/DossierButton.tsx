import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { rawColors } from '../../theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'stamp';
type TeamColor = 'friendly' | 'enemy' | 'neutral';

interface DossierButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  team?: TeamColor;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
}

const sizeStyles = {
  small: { padding: '8px 16px', fontSize: '12px', letterSpacing: '1px' },
  medium: { padding: '12px 24px', fontSize: '14px', letterSpacing: '2px' },
  large: { padding: '16px 32px', fontSize: '16px', letterSpacing: '2px' },
};

export function DossierButton({
  children,
  variant = 'primary',
  team,
  size = 'medium',
  fullWidth = false,
  disabled = false,
  className = '',
  ...props
}: DossierButtonProps) {
  const sizeStyle = sizeStyles[size];

  const getStyles = (): React.CSSProperties => {
    const teamColor = team === 'friendly' ? rawColors.teamFriendly
      : team === 'enemy' ? rawColors.teamEnemy
      : null;

    switch (variant) {
      case 'stamp':
        return {
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          background: 'transparent',
          border: `3px solid ${teamColor || rawColors.intelRed}`,
          color: teamColor || rawColors.intelRed,
          textTransform: 'uppercase',
          transform: 'rotate(-1deg)',
        };
      case 'danger':
        return {
          fontFamily: "'Courier Prime', monospace",
          background: `linear-gradient(180deg, ${rawColors.teamEnemyLight} 0%, ${rawColors.teamEnemy} 50%, ${rawColors.teamEnemyDim} 100%)`,
          border: 'none',
          color: rawColors.cream,
          textTransform: 'uppercase',
        };
      case 'secondary':
        return {
          fontFamily: "'Courier Prime', monospace",
          background: rawColors.bgPaper,
          border: `2px solid ${teamColor || rawColors.brass}`,
          color: teamColor || rawColors.inkBlack,
          textTransform: 'uppercase',
        };
      default: // primary
        return {
          fontFamily: "'Courier Prime', monospace",
          background: `linear-gradient(180deg, ${rawColors.brassLight}, ${rawColors.brass}, ${rawColors.brassDim})`,
          border: 'none',
          color: rawColors.navyDark,
          textTransform: 'uppercase',
          boxShadow: `0 3px 0 ${rawColors.brassDim}, 0 5px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)`,
        };
    }
  };

  return (
    <motion.button
      className={`
        relative font-bold cursor-pointer
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brass)]
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      style={{
        borderRadius: variant === 'stamp' ? '2px' : '4px',
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        letterSpacing: sizeStyle.letterSpacing,
        ...getStyles(),
      }}
      whileHover={disabled ? {} : { scale: 1.02, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.98, y: 2 }}
      disabled={disabled}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </motion.button>
  );
}

export default DossierButton;
