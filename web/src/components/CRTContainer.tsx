import { ReactNode } from 'react';

interface CRTContainerProps {
  children: ReactNode;
  className?: string;
  showScanlines?: boolean;
  showVignette?: boolean;
  showReflection?: boolean;
  intensity?: 'low' | 'medium' | 'high';
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
}: CRTContainerProps) {
  const intensityConfig = {
    low: { scanlineOpacity: 0.08, vignetteOpacity: 0.3, flickerChance: 0.02 },
    medium: { scanlineOpacity: 0.15, vignetteOpacity: 0.5, flickerChance: 0.05 },
    high: { scanlineOpacity: 0.25, vignetteOpacity: 0.7, flickerChance: 0.1 },
  };

  const config = intensityConfig[intensity];

  return (
    <div className={`relative ${className}`}>
      {/* CRT 扫描线 */}
      {showScanlines && (
        <div
          className="absolute inset-0 pointer-events-none z-50"
          style={{
            background: `repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent 2px,
              rgba(0, 0, 0, ${config.scanlineOpacity}) 2px,
              rgba(0, 0, 0, ${config.scanlineOpacity}) 4px
            )`,
          }}
        />
      )}

      {/* 屏幕边缘暗角 */}
      {showVignette && (
        <div
          className="absolute inset-0 pointer-events-none z-40"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)',
          }}
        />
      )}

      {/* 屏幕反光效果 */}
      {showReflection && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
          }}
        />
      )}

      {/* 内容 */}
      <div className="relative z-10">{children}</div>
    </div>
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
}

export function CRTPanel({
  children,
  className = '',
  borderColor = '#3a3a3a',
  background = '#0a0f0a',
}: CRTPanelProps) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: `linear-gradient(145deg, ${borderColor}, #1a1a1a)`,
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
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.9)',
        }}
      >
        {/* 屏幕弧度效果 */}
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
          }}
        />
        {children}
      </div>
    </div>
  );
}

/**
 * 紧张度配置类型
 */
export type TensionLevel = 'normal' | 'warning' | 'tense' | 'critical';

/**
 * 紧张度配置
 */
export const tensionConfig = {
  normal: {
    bg: '#1a2f1a',
    text: '#00ff88',
    progressBar: '#00ff88',
    borderColor: '#3d5544',
  },
  warning: {
    bg: '#2f2a1a',
    text: '#88ff00',
    progressBar: '#88ff00',
    borderColor: '#4a4a2a',
  },
  tense: {
    bg: '#2f1a1a',
    text: '#ffaa00',
    progressBar: '#ffaa00',
    borderColor: '#4a3a2a',
  },
  critical: {
    bg: '#3a1010',
    text: '#ff4444',
    progressBar: '#ff4444',
    borderColor: '#5a2020',
  },
};
