import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { rawColors } from '../../theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type TeamColor = 'friendly' | 'enemy' | 'neutral';

interface CRTButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  team?: TeamColor;
  showIndicator?: boolean;
  indicatorOn?: boolean;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
}

const variantStyles: Record<
  ButtonVariant,
  { bg: string; hoverBg: string; text: string; border: string }
> = {
  primary: {
    bg: `linear-gradient(180deg, ${rawColors.metalLight} 0%, ${rawColors.panel} 50%, ${rawColors.metalDark} 100%)`,
    hoverBg: `linear-gradient(180deg, ${rawColors.metalLight} 0%, ${rawColors.metal} 50%, ${rawColors.panel} 100%)`,
    text: rawColors.crtAmber,
    border: 'transparent',
  },
  secondary: {
    bg: `linear-gradient(180deg, ${rawColors.metalDark} 0%, ${rawColors.bgBase} 50%, ${rawColors.metalDark} 100%)`,
    hoverBg: `linear-gradient(180deg, ${rawColors.metalDark} 0%, ${rawColors.panel} 50%, ${rawColors.metalDark} 100%)`,
    text: rawColors.crtPhosphor,
    border: rawColors.panel,
  },
  danger: {
    bg: `linear-gradient(180deg, ${rawColors.teamEnemyDim} 0%, ${rawColors.bgBase} 50%, ${rawColors.teamEnemyDim} 100%)`,
    hoverBg: `linear-gradient(180deg, ${rawColors.teamEnemy}80 0%, ${rawColors.teamEnemyDim} 50%, ${rawColors.teamEnemy}80 100%)`,
    text: rawColors.teamEnemy,
    border: rawColors.teamEnemy,
  },
};

const teamStyles: Record<TeamColor, { color: string; border: string }> = {
  friendly: {
    color: rawColors.teamFriendly,
    border: rawColors.teamFriendly,
  },
  enemy: {
    color: rawColors.teamEnemy,
    border: rawColors.teamEnemy,
  },
  neutral: {
    color: rawColors.crtAmber,
    border: rawColors.crtAmber,
  },
};

const sizeStyles = {
  small: {
    padding: '8px 16px',
    fontSize: '12px',
    letterSpacing: '1px',
  },
  medium: {
    padding: '12px 24px',
    fontSize: '14px',
    letterSpacing: '2px',
  },
  large: {
    padding: '16px 32px',
    fontSize: '16px',
    letterSpacing: '2px',
  },
};

/**
 * CRT 风格按钮组件
 * 支持多种变体、团队颜色和指示灯效果
 */
export function CRTButton({
  children,
  variant = 'primary',
  team,
  showIndicator = false,
  indicatorOn = true,
  size = 'medium',
  fullWidth = false,
  disabled = false,
  className = '',
  ...props
}: CRTButtonProps) {
  const variantStyle = variantStyles[variant];
  const teamStyle = team ? teamStyles[team] : null;
  const sizeStyle = sizeStyles[size];

  const textColor = teamStyle?.color || variantStyle.text;
  const borderColor = teamStyle?.border || variantStyle.border;

  return (
    <motion.button
      className={`
        relative font-bold uppercase cursor-pointer
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-crt-phosphor)]
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      style={{
        fontFamily: "'Share Tech Mono', 'Arial', sans-serif",
        background: variantStyle.bg,
        border: borderColor !== 'transparent' ? `2px solid ${borderColor}` : 'none',
        borderRadius: '6px',
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        letterSpacing: sizeStyle.letterSpacing,
        color: textColor,
        boxShadow: `
          0 4px 0 ${rawColors.bgBase},
          0 6px 10px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.1)
        `,
      }}
      whileHover={
        disabled
          ? {}
          : {
              scale: 1.02,
              y: -1,
            }
      }
      whileTap={
        disabled
          ? {}
          : {
              scale: 0.98,
              y: 2,
            }
      }
      disabled={disabled}
      {...props}
    >
      {/* Button shine effect */}
      <div
        className="absolute top-0.5 left-0.5 right-0.5 h-1/2 rounded-t pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.1), transparent)',
        }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {showIndicator && (
          <span
            className={`indicator-light ${indicatorOn ? 'on' : ''} ${
              team === 'enemy' || variant === 'danger' ? '' : ''
            }`}
            style={{
              backgroundColor: indicatorOn ? textColor : rawColors.bgBase,
              boxShadow: indicatorOn
                ? `inset 0 2px 4px rgba(0,0,0,0.3), 0 0 10px ${textColor}, 0 0 20px ${textColor}`
                : `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 5px rgba(0,0,0,0.3)`,
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
        )}
        {children}
      </span>
    </motion.button>
  );
}

export default CRTButton;
