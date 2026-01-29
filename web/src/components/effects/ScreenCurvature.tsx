import { ReactNode } from 'react';

interface ScreenCurvatureProps {
  children: ReactNode;
  intensity?: 'subtle' | 'medium' | 'strong';
  className?: string;
}

/**
 * 屏幕曲率效果组件
 * 模拟 CRT 显示器的凸面玻璃效果
 */
export function ScreenCurvature({
  children,
  intensity = 'medium',
  className = '',
}: ScreenCurvatureProps) {
  const curvatureConfig = {
    subtle: {
      borderRadius: '8px / 6px',
      vignetteSize: '70%',
      shadowSpread: '60px',
    },
    medium: {
      borderRadius: '12px / 8px',
      vignetteSize: '60%',
      shadowSpread: '80px',
    },
    strong: {
      borderRadius: '16px / 12px',
      vignetteSize: '50%',
      shadowSpread: '100px',
    },
  };

  const config = curvatureConfig[intensity];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        borderRadius: config.borderRadius,
      }}
    >
      {/* 内容 */}
      {children}

      {/* 边缘暗角效果 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, transparent ${config.vignetteSize}, rgba(0,0,0,0.5) 100%)`,
        }}
      />

      {/* 屏幕边缘阴影 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 ${config.shadowSpread} rgba(0,0,0,0.6)`,
        }}
      />

      {/* 玻璃高光效果 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.05) 100%)',
        }}
      />

      {/* 顶部微弱高光 */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.1) 50%, transparent 90%)',
        }}
      />
    </div>
  );
}

export default ScreenCurvature;
