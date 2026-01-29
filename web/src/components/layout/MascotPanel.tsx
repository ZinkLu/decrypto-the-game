import { motion } from 'framer-motion';
import { TensionLevel, encryptorTensionConfig, rawColors } from '../../theme/colors';

interface MascotPanelProps {
  tension?: TensionLevel;
  className?: string;
  // Custom content (overrides default from tensionConfig)
  emoji?: string;
  message?: string;
  // Position options
  position?: 'bottom' | 'side';
  // Animation control
  animated?: boolean;
}

/**
 * 吉祥物面板组件
 * 显示根据紧张度变化的吉祥物表情和状态消息
 */
export function MascotPanel({
  tension = 'normal',
  className = '',
  emoji: customEmoji,
  message: customMessage,
  position = 'bottom',
  animated = true,
}: MascotPanelProps) {
  const config = encryptorTensionConfig[tension];
  const displayEmoji = customEmoji || config.emoji;
  const displayMessage = customMessage || config.message;

  const isBottom = position === 'bottom';

  return (
    <div
      className={`${isBottom ? 'absolute bottom-0 left-0 right-0' : ''} z-10 ${className}`}
      style={isBottom ? { height: '15%', minHeight: '100px' } : {}}
    >
      {/* CRT 屏幕边框 */}
      <div
        className={`absolute inset-0 ${isBottom ? 'rounded-t-lg' : 'rounded-lg'}`}
        style={{
          background: `linear-gradient(145deg, ${rawColors.panel}, ${rawColors.metalDark})`,
          borderTop: isBottom ? `4px solid ${rawColors.metal}` : undefined,
          border: !isBottom ? `4px solid ${rawColors.metal}` : undefined,
        }}
      />

      {/* CRT 屏幕内部 */}
      <div
        className={`absolute ${isBottom ? 'inset-x-4 bottom-2 top-2' : 'inset-2'} rounded overflow-hidden`}
        style={{
          background: rawColors.bgDark,
          border: `2px solid ${rawColors.bgBase}`,
        }}
      >
        {/* CRT 效果层 */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent 2px,
              rgba(0, 0, 0, 0.1) 2px,
              rgba(0, 0, 0, 0.1) 4px
            )`,
          }}
        />

        {/* 屏幕边缘暗角 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
          }}
        />

        {/* 屏幕反光 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
          }}
        />

        {/* 吉祥物内容 */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          {/* 表情 */}
          <motion.div
            className="text-4xl"
            animate={
              animated
                ? {
                    scale: tension === 'critical' ? [1, 1.1, 1] : 1,
                    rotate: tension === 'critical' ? [-1, 1, -1] : 0,
                  }
                : {}
            }
            transition={
              animated
                ? {
                    duration: tension === 'critical' ? 0.15 : 0.5,
                    repeat: tension === 'critical' ? Infinity : 0,
                  }
                : {}
            }
            style={{
              color: config.text,
              textShadow: `0 0 10px ${config.text}, 0 0 20px ${config.text}`,
              filter: `drop-shadow(0 0 ${tension === 'critical' ? 10 : 5}px ${config.text})`,
            }}
          >
            {displayEmoji}
          </motion.div>

          {/* 状态文字 */}
          <motion.span
            className="text-sm mt-1"
            style={{
              fontFamily: "'VT323', monospace",
              color: config.text,
              textShadow: `0 0 5px ${config.text}`,
            }}
            animate={
              animated
                ? {
                    opacity: [1, 0.7, 1],
                  }
                : {}
            }
            transition={
              animated
                ? {
                    duration: tension === 'critical' ? 0.3 : 1,
                    repeat: Infinity,
                  }
                : {}
            }
          >
            {displayMessage}
          </motion.span>
        </div>
      </div>
    </div>
  );
}

export default MascotPanel;
