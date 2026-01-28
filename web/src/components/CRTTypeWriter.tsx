import { useEffect, useState } from 'react';

interface CRTTypeWriterProps {
  text: string;
  speed?: number;
  delay?: number;
  onComplete?: () => void;
  cursorColor?: string;
}

export function CRTTypeWriter({
  text,
  speed = 50,
  delay = 0,
  onComplete,
  cursorColor = '#00ff88'
}: CRTTypeWriterProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setStarted(true);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;

    let currentIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Add a small random delay between characters for realism
    const typeWithVariation = () => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));

        // Random typing speed variation
        const charDelay = speed + (Math.random() - 0.5) * speed * 0.5;

        timeoutId = setTimeout(() => {
          currentIndex++;
          typeWithVariation();
        }, charDelay);
      } else {
        onComplete?.();
      }
    };

    timeoutId = setTimeout(typeWithVariation, speed);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [started, text, speed, onComplete]);

  return (
    <span
      className="font-mono"
      style={{
        fontFamily: "'VT323', 'Courier New', monospace",
        color: cursorColor,
        textShadow: `0 0 5px ${cursorColor}, 0 0 10px ${cursorColor}`
      }}
    >
      {displayedText}
      <span
        className="crt-cursor"
        style={{
          backgroundColor: cursorColor,
          boxShadow: `0 0 5px ${cursorColor}`
        }}
      />
    </span>
  );
}
