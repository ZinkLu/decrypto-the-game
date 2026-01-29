import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { TensionLevel, rawColors } from '../theme/colors';

type InputVariant = 'default' | 'minimal' | 'bordered';

interface CRTInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tension?: TensionLevel;
  disabled?: boolean;
  maxLength?: number;
  color?: 'green' | 'amber';
  // Enhanced properties
  variant?: InputVariant;
  showCharCount?: boolean;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}

// 紧张度配置
const tensionSettings = {
  normal: {
    cursorSpeed: 1,
    glowIntensity: 5,
    shake: false,
    cursorColor: rawColors.crtPhosphor,
  },
  warning: {
    cursorSpeed: 0.7,
    glowIntensity: 8,
    shake: false,
    cursorColor: rawColors.tensionWarningText,
  },
  tense: {
    cursorSpeed: 0.5,
    glowIntensity: 12,
    shake: false,
    cursorColor: rawColors.crtAmber,
  },
  critical: {
    cursorSpeed: 0.25,
    glowIntensity: 20,
    shake: true,
    cursorColor: rawColors.teamEnemy,
  },
};

const variantStyles: Record<
  InputVariant,
  { background: string; border: string; padding: string }
> = {
  default: {
    background: rawColors.bgDark,
    border: '2px solid',
    padding: '12px 16px',
  },
  minimal: {
    background: 'transparent',
    border: '0 0 2px 0',
    padding: '8px 0',
  },
  bordered: {
    background: rawColors.bgDark,
    border: '3px solid',
    padding: '16px 20px',
  },
};

export function CRTInput({
  value,
  onChange,
  placeholder = '输入...',
  tension = 'normal',
  disabled = false,
  maxLength = 20,
  color = 'green',
  variant = 'default',
  showCharCount = true,
  onSubmit,
  autoFocus = false,
  className = '',
}: CRTInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const settings = tensionSettings[tension];
  const baseColor = color === 'green' ? rawColors.crtPhosphor : rawColors.crtAmber;
  const currentColor = tension === 'critical' ? settings.cursorColor : baseColor;
  const variantStyle = variantStyles[variant];

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // 光标闪烁
  useEffect(() => {
    if (!isFocused) {
      setCursorVisible(false);
      return;
    }

    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, settings.cursorSpeed * 500);

    return () => clearInterval(interval);
  }, [isFocused, settings.cursorSpeed]);

  // 输入时重置光标
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.slice(0, maxLength);
    onChange(newValue);
    setCursorVisible(true);
  };

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit && value.trim()) {
      onSubmit(value);
    }
  };

  const borderColor = isFocused ? currentColor : rawColors.teamFriendlyDim;

  return (
    <motion.div
      className={`relative ${className}`}
      animate={
        settings.shake
          ? {
              x: [0, -2, 2, -2, 2, 0],
            }
          : {}
      }
      transition={
        settings.shake
          ? {
              duration: 0.1,
              repeat: Infinity,
              repeatType: 'loop',
            }
          : {}
      }
    >
      {/* 背景容器 */}
      <div
        className="relative rounded overflow-hidden"
        style={{
          background: variantStyle.background,
          border: variant === 'minimal'
            ? `none`
            : `${variantStyle.border.split(' ')[0]} solid ${borderColor}`,
          borderBottom: variant === 'minimal' ? `2px solid ${borderColor}` : undefined,
          boxShadow: isFocused
            ? `inset 0 2px 10px rgba(0,0,0,0.5), 0 0 ${settings.glowIntensity}px ${currentColor}40`
            : 'inset 0 2px 10px rgba(0,0,0,0.5)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* CRT 扫描线 */}
        {variant !== 'minimal' && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              background: `repeating-linear-gradient(
                to bottom,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.1) 2px,
                rgba(0, 0, 0, 0.1) 4px
              )`,
            }}
          />
        )}

        {/* 输入区域 */}
        <div
          className="relative flex items-center"
          style={{ padding: variantStyle.padding }}
        >
          {/* 实际输入框（透明） */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            className="absolute inset-0 w-full h-full bg-transparent outline-none opacity-0 cursor-text"
            style={{ caretColor: 'transparent', padding: variantStyle.padding }}
          />

          {/* 显示文字 */}
          <div
            className="flex-1 font-mono text-lg overflow-hidden whitespace-nowrap"
            style={{
              fontFamily: "'VT323', 'Courier New', monospace",
              color: currentColor,
              textShadow: `0 0 ${settings.glowIntensity}px ${currentColor}`,
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {value || <span style={{ opacity: 0.4 }}>{placeholder}</span>}

            {/* 自定义光标 */}
            {isFocused && (
              <motion.span
                className="inline-block align-middle ml-0.5"
                style={{
                  width: cursorVisible ? '10px' : '10px',
                  height: '1.2em',
                  background: currentColor,
                  boxShadow: `0 0 ${settings.glowIntensity}px ${currentColor}, 0 0 ${settings.glowIntensity * 2}px ${currentColor}`,
                  opacity: cursorVisible ? 1 : 0,
                  verticalAlign: 'text-bottom',
                }}
                animate={{
                  width: cursorVisible ? ['10px', '12px', '10px'] : '10px',
                  opacity: cursorVisible ? 1 : 0,
                }}
                transition={{
                  width: { duration: settings.cursorSpeed * 0.5, ease: 'easeInOut' },
                  opacity: { duration: 0.05 },
                }}
              />
            )}
          </div>

          {/* 字符计数 */}
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

      {/* 输入时的光晕效果 */}
      {isFocused && value && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 0.3 }}
          style={{
            background: `radial-gradient(ellipse at center, ${currentColor}20, transparent 70%)`,
          }}
        />
      )}

      {/* 紧急状态下的警告效果 */}
      {tension === 'critical' && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded"
          animate={{
            opacity: [0, 0.2, 0],
          }}
          transition={{
            duration: 0.3,
            repeat: Infinity,
          }}
          style={{
            background: `radial-gradient(ellipse at center, ${rawColors.teamEnemy}4D, transparent 70%)`,
          }}
        />
      )}
    </motion.div>
  );
}

export default CRTInput;
