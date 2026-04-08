import { rawColors } from '../../theme/colors';

interface TypewriterTextProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'dark' | 'light' | 'teal' | 'red' | 'brass' | string;
  className?: string;
  as?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p';
  'aria-hidden'?: boolean;
  role?: string;
}

const colorMap: Record<string, string> = {
  dark: rawColors.inkBlack,
  light: rawColors.cream,
  teal: rawColors.teamFriendly,
  red: rawColors.intelRed,
  brass: rawColors.brass,
};

const sizeStyles = {
  small: { fontSize: '0.875rem' },
  medium: { fontSize: '1.5rem' },
  large: { fontSize: '2.5rem' },
};

export function TypewriterText({
  text,
  size = 'medium',
  color = 'dark',
  className = '',
  as: Component = 'div',
  ...ariaProps
}: TypewriterTextProps) {
  const resolvedColor = colorMap[color] || color;

  return (
    <Component
      className={`${className}`}
      style={{
        fontFamily: "'Special Elite', 'Courier New', cursive",
        color: resolvedColor,
        textShadow: '0.5px 0.5px 0 rgba(0,0,0,0.2)',
        letterSpacing: '0.5px',
        ...sizeStyles[size],
      }}
      {...ariaProps}
    >
      {text}
    </Component>
  );
}

export default TypewriterText;
