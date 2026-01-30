import { ReactNode } from 'react';
import {
  TensionLevel,
  tensionConfig,
  opponentTensionConfig,
  rawColors,
} from '../../theme/colors';

type TensionConfigType = typeof tensionConfig | typeof opponentTensionConfig;

interface GamePageLayoutProps {
  children: ReactNode;
  tension?: TensionLevel;
  tensionConfig?: TensionConfigType;
  className?: string;
  showScrews?: boolean;
  viewType?: 'friendly' | 'opponent';
}

/**
 * Game page layout component
 * Provides tension-driven background gradient and decorations
 */
export function GamePageLayout({
  children,
  tension = 'normal',
  tensionConfig: customTensionConfig,
  className = '',
  showScrews = false,
  viewType = 'friendly',
}: GamePageLayoutProps) {
  // Select tension config based on view type or use custom
  const activeTensionConfig =
    customTensionConfig ||
    (viewType === 'opponent' ? opponentTensionConfig : tensionConfig);

  const config = activeTensionConfig[tension];

  return (
    <div
      className={`relative w-full h-full overflow-hidden transition-colors duration-1000 ${className}`}
      style={{
        background: `linear-gradient(180deg, ${config.bg} 0%, ${rawColors.bgDark} 100%)`,
      }}
    >
      {/* Corner screws (optional) */}
      {showScrews && (
        <>
          <div className="absolute top-2 left-2 z-20">
            <div className="screw" />
          </div>
          <div className="absolute top-2 right-2 z-20">
            <div className="screw" />
          </div>
          <div className="absolute bottom-2 left-2 z-20">
            <div className="screw" />
          </div>
          <div className="absolute bottom-2 right-2 z-20">
            <div className="screw" />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}

export default GamePageLayout;
