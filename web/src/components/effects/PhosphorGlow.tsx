import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { rawColors } from '../../theme/colors';

interface PhosphorGlowProps {
  children: ReactNode;
  color?: 'green' | 'amber' | 'red' | 'blue';
  intensity?: number; // 0.5 - 2, default 1
  animated?: boolean;
  pulseSpeed?: number; // seconds, default 2
  className?: string;
}

/**
 * 磷光余晖效果组件
 * 模拟 CRT 显示器的磷光发光效果
 */
export function PhosphorGlow({
  children,
  color = 'green',
  intensity = 1,
  animated = true,
  pulseSpeed = 2,
  className = '',
}: PhosphorGlowProps) {
  const colorMap = {
    green: rawColors.crtPhosphor,
    amber: rawColors.crtAmber,
    red: rawColors.teamEnemy,
    blue: '#00aaff',
  };

  const glowColor = colorMap[color];
  const baseGlow = 5 * intensity;
  const mediumGlow = 10 * intensity;
  const largeGlow = 20 * intensity;

  const glowStyle = {
    filter: `drop-shadow(0 0 ${baseGlow}px ${glowColor}) drop-shadow(0 0 ${mediumGlow}px ${glowColor})`,
  };

  if (!animated) {
    return (
      <div className={`relative ${className}`} style={glowStyle}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={`relative ${className}`}
      animate={{
        filter: [
          `drop-shadow(0 0 ${baseGlow}px ${glowColor}) drop-shadow(0 0 ${mediumGlow}px ${glowColor})`,
          `drop-shadow(0 0 ${mediumGlow}px ${glowColor}) drop-shadow(0 0 ${largeGlow}px ${glowColor})`,
          `drop-shadow(0 0 ${baseGlow}px ${glowColor}) drop-shadow(0 0 ${mediumGlow}px ${glowColor})`,
        ],
      }}
      transition={{
        duration: pulseSpeed,
        ease: 'easeInOut',
        repeat: Infinity,
      }}
    >
      {children}
    </motion.div>
  );
}

export default PhosphorGlow;
