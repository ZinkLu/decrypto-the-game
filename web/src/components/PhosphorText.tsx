import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { rawColors } from '../theme/colors';
import { RGBShift } from './effects/RGBShift';

interface PhosphorTextProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'green' | 'amber' | 'red' | 'blue' | string;
  // Enhanced properties
  showRGBShift?: boolean;
  rgbShiftIntensity?: number;
  glowIntensity?: number; // 0.5 - 2, default 1
  animated?: boolean;
  className?: string;
}

const colorMap: Record<string, string> = {
  green: rawColors.crtPhosphor,
  amber: rawColors.crtAmber,
  red: rawColors.teamEnemy,
  blue: '#00aaff',
};

export function PhosphorText({
  text,
  size = 'medium',
  color = 'green',
  showRGBShift = false,
  rgbShiftIntensity = 2,
  glowIntensity = 1,
  animated = true,
  className = '',
}: PhosphorTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isFlickering, setIsFlickering] = useState(false);

  const sizeClasses = {
    small: 'text-lg',
    medium: 'text-4xl',
    large: 'text-6xl',
  };

  const fontSizes = {
    small: '1.25rem',
    medium: '2.5rem',
    large: '4rem',
  };

  // Resolve color - support both preset names and custom colors
  const resolvedColor = colorMap[color] || color;

  // Calculate glow values based on intensity
  const baseGlow = 5 * glowIntensity;
  const mediumGlow = 10 * glowIntensity;
  const largeGlow = 20 * glowIntensity;

  useEffect(() => {
    if (!animated) return;

    const flickerInterval = setInterval(() => {
      // Random flicker effect
      if (Math.random() > 0.92) {
        setIsFlickering(true);

        // Random character substitution
        if (Math.random() > 0.5) {
          setDisplayText(
            text
              .split('')
              .map((char, i) =>
                i < 2 && Math.random() > 0.6
                  ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
                  : char
              )
              .join('')
          );
        }

        setTimeout(() => {
          setIsFlickering(false);
          setDisplayText(text);
        }, 50 + Math.random() * 150);
      }
    }, 2000);

    return () => clearInterval(flickerInterval);
  }, [text, animated]);

  // Update display text when prop changes
  useEffect(() => {
    setDisplayText(text);
  }, [text]);

  const textContent = (
    <motion.div
      className={`${sizeClasses[size]} font-bold font-mono ${className}`}
      style={{
        fontSize: fontSizes[size],
        fontFamily: "'VT323', 'Courier New', monospace",
        color: resolvedColor,
        textShadow: `
          0 0 ${baseGlow}px ${resolvedColor},
          0 0 ${mediumGlow}px ${resolvedColor},
          0 0 ${largeGlow}px ${resolvedColor}
        `,
      }}
      animate={
        animated
          ? {
              opacity: isFlickering ? [1, 0.7, 1, 0.9, 1] : 1,
              filter: isFlickering
                ? ['brightness(1)', 'brightness(1.5)', 'brightness(1)']
                : 'brightness(1)',
            }
          : {}
      }
      transition={{ duration: 0.3 }}
    >
      {displayText}
    </motion.div>
  );

  // Ghost trail effect for non-green colors
  const ghostTrail =
    color !== 'green' && animated ? (
      <motion.div
        className={`absolute top-0 left-0 ${sizeClasses[size]} font-bold font-mono opacity-30`}
        style={{
          fontSize: fontSizes[size],
          fontFamily: "'VT323', 'Courier New', monospace",
          color: resolvedColor,
          textShadow: `0 0 ${mediumGlow}px ${resolvedColor}`,
          filter: 'blur(2px)',
        }}
        animate={{
          x: isFlickering ? [-3, 3, -2, 0] : 0,
          opacity: isFlickering ? [0, 0.4, 0] : 0.3,
        }}
        transition={{ duration: 0.15 }}
      >
        {displayText}
      </motion.div>
    ) : null;

  if (showRGBShift) {
    return (
      <div className="relative inline-block">
        <RGBShift intensity={rgbShiftIntensity} animated={isFlickering}>
          {textContent}
        </RGBShift>
        {ghostTrail}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      {textContent}
      {ghostTrail}
    </div>
  );
}

export default PhosphorText;
