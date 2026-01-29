import { ReactNode } from 'react';
import { colors as themeColors, screenEffectColors } from '../theme/colors';
import { CRTEffectLayer } from './effects/CRTEffectLayer';

// Re-export from theme for backward compatibility
export { tensionConfig, type TensionLevel, colors } from '../theme/colors';

// Local alias for use in this file
const colors = themeColors;

interface CRTContainerProps {
  children: ReactNode;
  className?: string;
  showScanlines?: boolean;
  showVignette?: boolean;
  showReflection?: boolean;
  intensity?: 'low' | 'medium' | 'high';
  // New enhanced properties
  showRGBShift?: boolean;
  rgbShiftIntensity?: number;
  curvatureIntensity?: 'subtle' | 'medium' | 'strong';
  flickerFrequency?: number;
  showFlicker?: boolean;
}

/**
 * CRT 屏幕容器组件
 * 提供统一的 CRT 效果包装，包括扫描线、暗角、反光等
 */
export function CRTContainer({
  children,
  className = '',
  showScanlines = true,
  showVignette = true,
  showReflection = true,
  intensity = 'medium',
  showRGBShift = false,
  rgbShiftIntensity = 2,
  curvatureIntensity,
  flickerFrequency = 0.05,
  showFlicker = true,
}: CRTContainerProps) {
  const intensityConfig = {
    low: { scanlineOpacity: 0.08, vignetteOpacity: 0.3 },
    medium: { scanlineOpacity: 0.15, vignetteOpacity: 0.5 },
    high: { scanlineOpacity: 0.25, vignetteOpacity: 0.7 },
  };

  const config = intensityConfig[intensity];

  return (
    <CRTEffectLayer
      className={className}
      showScanlines={showScanlines}
      scanlineOpacity={config.scanlineOpacity}
      showVignette={showVignette}
      vignetteOpacity={config.vignetteOpacity}
      showReflection={showReflection}
      showRGBShift={showRGBShift}
      rgbShiftIntensity={rgbShiftIntensity}
      showCurvature={!!curvatureIntensity}
      curvatureIntensity={curvatureIntensity}
      showFlicker={showFlicker}
      flickerFrequency={flickerFrequency}
    >
      {/* 内容 */}
      <div className="relative z-10">{children}</div>
    </CRTEffectLayer>
  );
}

/**
 * CRT 面板组件 - 带边框的 CRT 屏幕
 */
interface CRTPanelProps {
  children: ReactNode;
  className?: string;
  borderColor?: string;
  background?: string;
  // Enhanced properties
  showRGBShift?: boolean;
  curvatureIntensity?: 'subtle' | 'medium' | 'strong';
}

export function CRTPanel({
  children,
  className = '',
  borderColor = colors.panel,
  background = colors.bgDark,
  showRGBShift = false,
  curvatureIntensity,
}: CRTPanelProps) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: `linear-gradient(145deg, ${borderColor}, ${colors.bgBase})`,
        boxShadow: `
          inset 0 2px 10px rgba(0,0,0,0.5),
          0 0 0 2px ${borderColor}
        `,
      }}
    >
      <div
        className="rounded overflow-hidden relative"
        style={{
          background,
          boxShadow: `inset 0 0 100px ${screenEffectColors.shadow}`,
        }}
      >
        {/* 屏幕弧度效果 */}
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: `radial-gradient(ellipse at center, transparent 60%, ${screenEffectColors.vignette} 100%)`,
          }}
        />
        <CRTContainer
          showScanlines={false}
          showVignette={false}
          showRGBShift={showRGBShift}
          curvatureIntensity={curvatureIntensity}
        >
          {children}
        </CRTContainer>
      </div>
    </div>
  );
}
