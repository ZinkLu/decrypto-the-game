import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TensionLevel } from '../theme/colors';

interface CRTInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tension?: TensionLevel;
  disabled?: boolean;
  maxLength?: number;
  color?: 'green' | 'amber';
}

// 紧张度配置
const tensionSettings = {
  normal: {
    cursorSpeed: 1,
    glowIntensity: 5,
    shake: false,
    cursorColor: '#00ff88',
  },
  warning: {
    cursorSpeed: 0.7,
    glowIntensity: 8,
    shake: false,
    cursorColor: '#88ff00',
  },
  tense: {
    cursorSpeed: 0.5,
    glowIntensity: 12,
    shake: false,
    cursorColor: '#ffaa00',
  },
  critical: {
    cursorSpeed: 0.25,
    glowIntensity: 20,
    shake: true,
    cursorColor: '#ff4444',
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
}: CRTInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const settings = tensionSettings[tension];
  const baseColor = color === 'green' ? '#00ff88' : '#ffaa00';
  const currentColor = tension === 'critical' ? settings.cursorColor : baseColor;

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

  return (
    <motion.div
      className="relative"
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
          background: '#0a0f0a',
          border: `2px solid ${isFocused ? currentColor : '#3d5544'}`,
          boxShadow: isFocused
            ? `inset 0 2px 10px rgba(0,0,0,0.5), 0 0 ${settings.glowIntensity}px ${currentColor}40`
            : 'inset 0 2px 10px rgba(0,0,0,0.5)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* CRT 扫描线 */}
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

        {/* 输入区域 */}
        <div className="relative flex items-center px-4 py-3">
          {/* 实际输入框（透明） */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            className="absolute inset-0 w-full h-full px-4 py-3 bg-transparent outline-none opacity-0 cursor-text"
            style={{ caretColor: 'transparent' }}
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
            {value || (
              <span style={{ opacity: 0.4 }}>{placeholder}</span>
            )}

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
          {maxLength && value.length > 0 && (
            <span
              className="text-xs font-mono ml-2"
              style={{
                fontFamily: "'VT323', monospace",
                color: value.length >= maxLength ? '#ff4444' : '#3d5544',
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
            background: 'radial-gradient(ellipse at center, rgba(255, 68, 68, 0.3), transparent 70%)',
          }}
        />
      )}
    </motion.div>
  );
}

export default CRTInput;
