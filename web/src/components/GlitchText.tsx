import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface GlitchTextProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
}

const glitchVariants = {
  normal: { opacity: 1 },
  glitch: {
    opacity: [1, 0.8, 1, 0.5, 1],
    x: [0, -2, 3, -1, 0],
    transition: { duration: 0.2 }
  }
};

export function GlitchText({ text, size = 'medium' }: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [displayText, setDisplayText] = useState(text);

  const sizeClasses = {
    small: 'text-xl',
    medium: 'text-5xl',
    large: 'text-7xl'
  };

  const fontSize = {
    small: '1.25rem',
    medium: '3rem',
    large: '5rem'
  };

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        setIsGlitching(true);
        setDisplayText(
          text
            .split('')
            .map((char, i) =>
              i < 2 && Math.random() > 0.5
                ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
                : char
            )
            .join('')
        );
        setTimeout(() => {
          setIsGlitching(false);
          setDisplayText(text);
        }, 100 + Math.random() * 200);
      }
    }, 2000);

    return () => clearInterval(glitchInterval);
  }, [text]);

  return (
    <div className="relative inline-block">
      <motion.div
        className={`${sizeClasses[size]} font-bold font-mono text-cyber-primary neon-text`}
        style={{ fontSize: fontSize[size] }}
        variants={glitchVariants}
        animate={isGlitching ? 'glitch' : 'normal'}
      >
        {displayText}
      </motion.div>
      {/* Glitch overlay layers */}
      <motion.div
        className={`absolute top-0 left-0 ${sizeClasses[size]} font-bold font-mono text-cyber-secondary opacity-50`}
        style={{ fontSize: fontSize[size], clipPath: 'inset(0 0 50% 0)' }}
        animate={{
          x: isGlitching ? [-2, 2, -1, 0] : 0,
          opacity: isGlitching ? [0, 0.8, 0, 0.5, 0] : 0
        }}
        transition={{ duration: 0.2 }}
      >
        {displayText}
      </motion.div>
      <motion.div
        className={`absolute top-0 left-0 ${sizeClasses[size]} font-bold font-mono text-cyber-accent opacity-50`}
        style={{ fontSize: fontSize[size], clipPath: 'inset(50% 0 0 0)' }}
        animate={{
          x: isGlitching ? [2, -2, 1, 0] : 0,
          opacity: isGlitching ? [0, 0.5, 0, 0.8, 0] : 0
        }}
        transition={{ duration: 0.2 }}
      >
        {displayText}
      </motion.div>
    </div>
  );
}
