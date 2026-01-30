import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { rawColors } from '../theme/colors';

interface CRTInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  color?: 'green' | 'amber';
  showCharCount?: boolean;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}

export function CRTInput({
  value,
  onChange,
  placeholder = '输入...',
  disabled = false,
  maxLength = 20,
  color = 'green',
  showCharCount = true,
  onSubmit,
  autoFocus = false,
  className = '',
}: CRTInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseColor = color === 'green' ? rawColors.crtPhosphor : rawColors.crtAmber;

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Cursor blinking
  useEffect(() => {
    if (!isFocused) {
      setCursorVisible(false);
      return;
    }

    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.slice(0, maxLength);
    onChange(newValue);
    setCursorVisible(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit && value.trim()) {
      onSubmit(value);
    }
  };

  const borderColor = isFocused ? baseColor : rawColors.teamFriendlyDim;

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative rounded overflow-hidden"
        style={{
          background: rawColors.bgDark,
          border: `2px solid ${borderColor}`,
          transition: 'border-color 0.2s',
        }}
      >
        {/* Input area */}
        <div className="relative flex items-center p-3">
          {/* Actual input (transparent) */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            className="absolute inset-0 w-full h-full bg-transparent outline-none opacity-0 cursor-text p-3"
            style={{ caretColor: 'transparent' }}
          />

          {/* Display text */}
          <div
            className="flex-1 font-mono text-lg overflow-hidden whitespace-nowrap"
            style={{
              fontFamily: "'VT323', 'Courier New', monospace",
              color: baseColor,
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {value || <span style={{ opacity: 0.4 }}>{placeholder}</span>}

            {/* Custom cursor */}
            {isFocused && (
              <span
                className="inline-block align-middle ml-0.5"
                style={{
                  width: '10px',
                  height: '1.2em',
                  background: baseColor,
                  opacity: cursorVisible ? 1 : 0,
                  verticalAlign: 'text-bottom',
                }}
              />
            )}
          </div>

          {/* Character count */}
          {showCharCount && maxLength && value.length > 0 && (
            <span
              className="text-xs font-mono ml-2"
              style={{
                fontFamily: "'VT323', monospace",
                color: value.length >= maxLength ? rawColors.teamEnemy : rawColors.teamFriendlyDim,
              }}
            >
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default CRTInput;
