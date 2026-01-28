import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PhosphorTextProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'green' | 'amber';
}

export function PhosphorText({ text, size = 'medium', color = 'green' }: PhosphorTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isFlickering, setIsFlickering] = useState(false);

  const sizeClasses = {
    small: 'text-lg',
    medium: 'text-4xl',
    large: 'text-6xl'
  };

  const fontSizes = {
    small: '1.25rem',
    medium: '2.5rem',
    large: '4rem'
  };

  const colorClass = color === 'green' ? 'phosphor-text' : 'phosphor-text-amber';

  useEffect(() => {
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
  }, [text]);

  return (
    <div className="relative inline-block">
      <motion.div
        className={`${sizeClasses[size]} font-bold font-mono ${colorClass}`}
        style={{ fontSize: fontSizes[size] }}
        animate={{
          opacity: isFlickering ? [1, 0.7, 1, 0.9, 1] : 1,
          filter: isFlickering ? ['brightness(1)', 'brightness(1.5)', 'brightness(1)'] : 'brightness(1)'
        }}
        transition={{ duration: 0.3 }}
      >
        {displayText}
      </motion.div>

      {/* Ghost trail effect for amber color */}
      {color === 'amber' && (
        <motion.div
          className={`absolute top-0 left-0 ${sizeClasses[size]} font-bold font-mono opacity-30`}
          style={{
            fontSize: fontSizes[size],
            color: '#ffaa00',
            textShadow: '0 0 10px #ffaa00',
            filter: 'blur(2px)'
          }}
          animate={{
            x: isFlickering ? [-3, 3, -2, 0] : 0,
            opacity: isFlickering ? [0, 0.4, 0] : 0.3
          }}
          transition={{ duration: 0.15 }}
        >
          {displayText}
        </motion.div>
      )}
    </div>
  );
}
