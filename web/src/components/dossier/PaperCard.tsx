import { ReactNode } from 'react';
import { rawColors } from '../../theme/colors';

interface PaperCardProps {
  children: ReactNode;
  variant?: 'default' | 'index' | 'note';
  showPaperClip?: boolean;
  showCoffeeStain?: boolean;
  showFoldMark?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function PaperCard({
  children,
  variant = 'default',
  showPaperClip = false,
  showCoffeeStain = false,
  showFoldMark = false,
  className = '',
  style,
  onClick,
}: PaperCardProps) {
  const baseStyles: React.CSSProperties = {
    backgroundColor: rawColors.bgPaper,
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
    color: rawColors.inkBlack,
    borderRadius: '2px',
    position: 'relative',
    boxShadow: '2px 3px 8px rgba(0,0,0,0.3), 0 1px 0 rgba(0,0,0,0.1)',
    ...style,
  };

  if (variant === 'index') {
    baseStyles.backgroundImage = `
      repeating-linear-gradient(transparent, transparent 28px, #a0c4e8 28px, #a0c4e8 29px),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")
    `;
  }

  if (variant === 'note') {
    baseStyles.backgroundColor = '#FFFACD';
    baseStyles.boxShadow = '2px 3px 6px rgba(0,0,0,0.2)';
  }

  return (
    <div
      className={`relative ${className}`}
      style={baseStyles}
      onClick={onClick}
    >
      {/* Torn edge top */}
      <div
        className="absolute -top-[5px] left-0 right-0 h-[6px] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 6'%3E%3Cpath d='M0,6 L3,2 L7,5 L12,1 L17,4 L22,2 L27,5 L32,1 L37,4 L42,2 L47,5 L52,1 L57,4 L62,2 L67,5 L72,1 L77,4 L82,2 L87,5 L92,1 L97,3 L100,6 Z' fill='${encodeURIComponent(rawColors.bgPaper)}'/%3E%3C/svg%3E")`,
          backgroundSize: '100% 100%',
        }}
      />

      {/* Paper clip */}
      {showPaperClip && (
        <div
          className="absolute -top-3 right-6 w-4 h-10 rounded-full pointer-events-none"
          style={{
            border: '2px solid #888',
            background: 'linear-gradient(90deg, #aaa, #ccc, #aaa)',
            zIndex: 10,
            transform: 'rotate(5deg)',
          }}
        />
      )}

      {/* Coffee stain */}
      {showCoffeeStain && (
        <div
          className="absolute pointer-events-none"
          style={{
            width: '55px',
            height: '55px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, transparent 35%, rgba(139,90,43,0.08) 50%, transparent 65%)',
            top: '-8px',
            right: '-8px',
            zIndex: 5,
          }}
        />
      )}

      {/* Fold mark */}
      {showFoldMark && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 0,
            right: 0,
            width: '30px',
            height: '30px',
            background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.04) 50%)',
            zIndex: 5,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export default PaperCard;
