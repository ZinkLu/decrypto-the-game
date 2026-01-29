import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RGBShift } from './RGBShift';
import { ScreenCurvature } from './ScreenCurvature';
import { screenEffectColors } from '../../theme/colors';

interface CRTEffectLayerProps {
  children: ReactNode;
  className?: string;
  // Scanline options
  showScanlines?: boolean;
  scanlineOpacity?: number; // 0-1, default 0.15
  scanlineSpacing?: number; // px, default 4
  // RGB shift options
  showRGBShift?: boolean;
  rgbShiftIntensity?: number; // 1-5, default 2
  rgbShiftAnimated?: boolean;
  // Curvature options
  showCurvature?: boolean;
  curvatureIntensity?: 'subtle' | 'medium' | 'strong';
  // Vignette options
  showVignette?: boolean;
  vignetteOpacity?: number; // 0-1, default 0.5
  // Reflection options
  showReflection?: boolean;
  // Flicker options
  showFlicker?: boolean;
  flickerFrequency?: number; // 0-1, chance per interval, default 0.05
}

/**
 * CRT 效果层组件
 * 组合多种 CRT 效果，提供统一的配置接口
 */
export function CRTEffectLayer({
  children,
  className = '',
  showScanlines = true,
  scanlineOpacity = 0.15,
  scanlineSpacing = 4,
  showRGBShift = false,
  rgbShiftIntensity = 2,
  rgbShiftAnimated = false,
  showCurvature = false,
  curvatureIntensity = 'medium',
  showVignette = true,
  vignetteOpacity = 0.5,
  showReflection = true,
  showFlicker = true,
  flickerFrequency = 0.05,
}: CRTEffectLayerProps) {
  // Wrap content with optional RGB shift
  let content = <>{children}</>;

  if (showRGBShift) {
    content = (
      <RGBShift intensity={rgbShiftIntensity} animated={rgbShiftAnimated}>
        {content}
      </RGBShift>
    );
  }

  // Wrap with optional curvature
  if (showCurvature) {
    content = (
      <ScreenCurvature intensity={curvatureIntensity}>{content}</ScreenCurvature>
    );
  }

  return (
    <motion.div
      className={`relative ${className}`}
      animate={
        showFlicker
          ? {
              opacity: [1, 1, 1, 0.98, 1, 1, 0.99, 1],
            }
          : {}
      }
      transition={
        showFlicker
          ? {
              duration: 0.15,
              repeat: Infinity,
              repeatDelay: Math.random() * (1 / flickerFrequency),
            }
          : {}
      }
    >
      {/* Main content */}
      {content}

      {/* Scanlines overlay */}
      {showScanlines && (
        <div
          className="absolute inset-0 pointer-events-none z-50"
          style={{
            background: `repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent ${scanlineSpacing / 2}px,
              rgba(0, 0, 0, ${scanlineOpacity}) ${scanlineSpacing / 2}px,
              rgba(0, 0, 0, ${scanlineOpacity}) ${scanlineSpacing}px
            )`,
          }}
        />
      )}

      {/* Vignette overlay */}
      {showVignette && (
        <div
          className="absolute inset-0 pointer-events-none z-40"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
          }}
        />
      )}

      {/* Screen reflection */}
      {showReflection && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: `linear-gradient(135deg, ${screenEffectColors.reflection} 0%, transparent 50%, rgba(0,0,0,0.1) 100%)`,
          }}
        />
      )}
    </motion.div>
  );
}

export default CRTEffectLayer;
