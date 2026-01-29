import { ReactNode } from 'react';
import { motion } from 'framer-motion';
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
  // Optional decorations
  showScrews?: boolean;
  showCriticalPulse?: boolean;
  showShake?: boolean;
  // View type for automatic config selection
  viewType?: 'friendly' | 'opponent';
}

/**
 * 游戏页面统一布局组件
 * 提供紧张度驱动的背景渐变、CRT 效果和装饰元素
 */
export function GamePageLayout({
  children,
  tension = 'normal',
  tensionConfig: customTensionConfig,
  className = '',
  showScrews = false,
  showCriticalPulse = true,
  showShake = true,
  viewType = 'friendly',
}: GamePageLayoutProps) {
  // Select tension config based on view type or use custom
  const activeTensionConfig =
    customTensionConfig ||
    (viewType === 'opponent' ? opponentTensionConfig : tensionConfig);

  const config = activeTensionConfig[tension];

  return (
    <motion.div
      className={`relative w-full h-full overflow-hidden transition-colors duration-1000 ${className}`}
      style={{
        background: `linear-gradient(180deg, ${config.bg} 0%, ${rawColors.bgDark} 100%)`,
      }}
      animate={
        showShake && (tension === 'tense' || tension === 'critical')
          ? {
              x:
                tension === 'critical'
                  ? [0, -2, 2, -2, 2, 0]
                  : [0, -1, 1, -1, 0],
            }
          : {}
      }
      transition={
        showShake && (tension === 'tense' || tension === 'critical')
          ? {
              duration: tension === 'critical' ? 0.1 : 0.2,
              repeat: Infinity,
              repeatType: 'loop',
            }
          : {}
      }
    >
      {/* CRT Scanlines */}
      <div className="crt-scanlines" />

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

      {/* Critical pulse effect */}
      {showCriticalPulse && tension === 'critical' && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          animate={{
            opacity: [0, 0.2, 0],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
          }}
          style={{
            background: `radial-gradient(ellipse at center, ${rawColors.teamEnemy}4D, transparent 70%)`,
          }}
        />
      )}
    </motion.div>
  );
}

export default GamePageLayout;
