import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { rawColors } from '../../theme/colors';

interface TypewriterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  color?: 'dark' | 'light';
  showCharCount?: boolean;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function TypewriterInput({
  value,
  onChange,
  placeholder = '输入…',
  disabled = false,
  maxLength = 20,
  color = 'dark',
  showCharCount = true,
  onSubmit,
  autoFocus = false,
  className = '',
  'aria-label': ariaLabel,
}: TypewriterInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = color === 'dark';
  const textColor = isDark ? rawColors.inkBlack : rawColors.cream;
  const borderColor = isFocused
    ? (isDark ? rawColors.brass : rawColors.teamFriendly)
    : (isDark ? rawColors.creamDark : rawColors.teamFriendlyDim);
  const bgColor = isDark ? rawColors.bgPaper : 'transparent';

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

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

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative overflow-hidden"
        style={{
          background: bgColor,
          borderBottom: `2px solid ${borderColor}`,
          transition: 'border-color 0.2s',
        }}
      >
        <div className="relative flex items-center p-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-label={ariaLabel || placeholder}
            className="absolute inset-0 w-full h-full bg-transparent outline-none opacity-0 cursor-text p-3"
            style={{ caretColor: 'transparent' }}
          />

          <div
            className="flex-1 text-lg overflow-hidden whitespace-nowrap"
            style={{
              fontFamily: "'Special Elite', 'Courier New', cursive",
              color: textColor,
              textShadow: '0.5px 0.5px 0 rgba(0,0,0,0.15)',
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {value || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>{placeholder}</span>}

            {isFocused && (
              <span
                className="inline-block align-middle ml-0.5"
                style={{
                  width: '2px',
                  height: '1.2em',
                  background: textColor,
                  opacity: cursorVisible ? 1 : 0,
                  verticalAlign: 'text-bottom',
                }}
              />
            )}
          </div>

          {showCharCount && maxLength && value.length > 0 && (
            <span
              className="text-xs ml-2"
              style={{
                fontFamily: "'Courier Prime', monospace",
                color: value.length >= maxLength ? rawColors.intelRed : rawColors.creamDark,
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

export default TypewriterInput;
