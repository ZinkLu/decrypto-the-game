import { useState, useEffect } from 'react';
import { rawColors } from '../../theme/colors';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface RedactedTextProps {
  length?: number;
  className?: string;
  glitch?: boolean;
  glitchSpeed?: number;
}

const GLITCH_CHARS = '█▓▒░▮▯▰▱';

export function RedactedText({
  length = 8,
  className = '',
  glitch = true,
  glitchSpeed = 150,
}: RedactedTextProps) {
  const prefersReducedMotion = useReducedMotion();
  const [text, setText] = useState('█'.repeat(length));

  useEffect(() => {
    if (!glitch || prefersReducedMotion) return;
    const timer = setInterval(() => {
      setText(
        Array.from({ length }, () =>
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        ).join('')
      );
    }, glitchSpeed);
    return () => clearInterval(timer);
  }, [length, glitch, glitchSpeed]);

  return (
    <span
      className={`select-none ${className}`}
      style={{
        fontFamily: "'Courier Prime', monospace",
        color: rawColors.inkBlack,
        backgroundColor: rawColors.inkBlack,
        padding: '0 4px',
        letterSpacing: '0',
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

export default RedactedText;
