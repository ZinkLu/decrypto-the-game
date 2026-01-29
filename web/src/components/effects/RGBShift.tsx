import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface RGBShiftProps {
  children: ReactNode;
  intensity?: number; // 1-5, default 2
  enabled?: boolean;
  animated?: boolean;
}

/**
 * RGB 色差效果组件
 * 模拟 CRT 显示器的色差偏移效果
 */
export function RGBShift({
  children,
  intensity = 2,
  enabled = true,
  animated = false,
}: RGBShiftProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  const offset = Math.max(1, Math.min(5, intensity));

  return (
    <div className="relative">
      {/* 红色通道 - 向左偏移 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          mixBlendMode: 'screen',
          filter: 'url(#redChannel)',
        }}
        animate={
          animated
            ? {
                x: [-offset, -offset - 0.5, -offset],
              }
            : { x: -offset }
        }
        transition={
          animated
            ? {
                duration: 0.1,
                repeat: Infinity,
                repeatType: 'reverse',
              }
            : undefined
        }
      >
        <div style={{ opacity: 0.8 }}>{children}</div>
      </motion.div>

      {/* 蓝色通道 - 向右偏移 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          mixBlendMode: 'screen',
          filter: 'url(#blueChannel)',
        }}
        animate={
          animated
            ? {
                x: [offset, offset + 0.5, offset],
              }
            : { x: offset }
        }
        transition={
          animated
            ? {
                duration: 0.1,
                repeat: Infinity,
                repeatType: 'reverse',
              }
            : undefined
        }
      >
        <div style={{ opacity: 0.8 }}>{children}</div>
      </motion.div>

      {/* 主内容（绿色通道） */}
      <div className="relative">{children}</div>

      {/* SVG 滤镜定义 */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="redChannel">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
            />
          </filter>
          <filter id="blueChannel">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

export default RGBShift;
