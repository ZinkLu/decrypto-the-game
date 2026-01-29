import { ReactNode } from 'react';
import { colors, deviceColors } from '../../theme/colors';

interface DeviceFrameProps {
  children: ReactNode;
  className?: string;
  // Decorations
  showScrews?: boolean;
  showCornerFrames?: boolean;
  // Label
  labelText?: string;
  // Sizing
  maxWidth?: string;
}

/**
 * 设备框架组件
 * 提供统一的 CRT 设备外观，包括边框、螺丝和标签
 */
export function DeviceFrame({
  children,
  className = '',
  showScrews = true,
  showCornerFrames = true,
  labelText,
  maxWidth = '800px',
}: DeviceFrameProps) {
  return (
    <div
      className={`crt-screen relative ${className}`}
      style={{ maxWidth, width: '100%' }}
    >
      {/* Corner screws */}
      {showScrews && (
        <>
          <div className="absolute -top-1 -left-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -top-1 -right-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -bottom-1 -left-1 z-20">
            <div className="screw" />
          </div>
          <div className="absolute -bottom-1 -right-1 z-20">
            <div className="screw" />
          </div>
        </>
      )}

      {/* Inner CRT Screen */}
      <div className="crt-screen-inner p-6 relative">
        {/* Device label plate */}
        {labelText && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded border z-10"
            style={{
              fontFamily: "'VT323', monospace",
              backgroundColor: deviceColors.labelBg,
              borderColor: deviceColors.labelBorder,
            }}
          >
            <span
              className="text-sm tracking-widest"
              style={{ color: colors.crtAmber }}
            >
              {labelText}
            </span>
          </div>
        )}

        {/* Content */}
        {children}

        {/* Corner frame decorations */}
        {showCornerFrames && (
          <>
            <div className="frame-corner tl" />
            <div className="frame-corner tr" />
            <div className="frame-corner bl" />
            <div className="frame-corner br" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 侧边装饰面板组件
 */
interface SidePanelDecorationsProps {
  position: 'left' | 'right';
  className?: string;
}

export function SidePanelDecorations({
  position,
  className = '',
}: SidePanelDecorationsProps) {
  const positionClass = position === 'left' ? 'left-4' : 'right-4';

  return (
    <div
      className={`absolute ${positionClass} top-1/2 -translate-y-1/2 flex flex-col gap-4 ${className}`}
    >
      <div className="w-2 h-32 panel-grille rounded" />
      <div className="w-2 h-32 panel-grille rounded" />
    </div>
  );
}

export default DeviceFrame;
