import { motion } from 'framer-motion';
import { rawColors, TensionLevel } from '../../theme/colors';

interface NumberPadProps {
  onNumberSelect: (num: number) => void;
  selectedNumbers?: number[];
  disabledNumbers?: number[];
  maxSelections?: number;
  range?: [number, number]; // [min, max] inclusive, default [1, 4]
  tension?: TensionLevel;
  layout?: 'horizontal' | 'grid';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeConfig = {
  small: {
    buttonSize: '40px',
    fontSize: '1.25rem',
    gap: '8px',
  },
  medium: {
    buttonSize: '56px',
    fontSize: '1.5rem',
    gap: '12px',
  },
  large: {
    buttonSize: '72px',
    fontSize: '2rem',
    gap: '16px',
  },
};

const tensionColors: Record<TensionLevel, { active: string; text: string }> = {
  normal: {
    active: rawColors.crtPhosphor,
    text: rawColors.crtPhosphor,
  },
  warning: {
    active: rawColors.tensionWarningText,
    text: rawColors.tensionWarningText,
  },
  tense: {
    active: rawColors.crtAmber,
    text: rawColors.crtAmber,
  },
  critical: {
    active: rawColors.teamEnemy,
    text: rawColors.teamEnemy,
  },
};

/**
 * 数字键盘组件
 * 用于解码页面的数字输入
 */
export function NumberPad({
  onNumberSelect,
  selectedNumbers = [],
  disabledNumbers = [],
  maxSelections = 3,
  range = [1, 4],
  tension = 'normal',
  layout = 'horizontal',
  size = 'medium',
  className = '',
}: NumberPadProps) {
  const [min, max] = range;
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const config = sizeConfig[size];
  const colors = tensionColors[tension];

  const canSelectMore = selectedNumbers.length < maxSelections;

  const handleSelect = (num: number) => {
    if (disabledNumbers.includes(num)) return;
    if (selectedNumbers.includes(num)) return;
    if (!canSelectMore) return;
    onNumberSelect(num);
  };

  return (
    <div
      className={`flex ${layout === 'grid' ? 'flex-wrap justify-center' : ''} ${className}`}
      style={{ gap: config.gap }}
    >
      {numbers.map((num) => {
        const isSelected = selectedNumbers.includes(num);
        const isDisabled = disabledNumbers.includes(num);
        const isAvailable = !isSelected && !isDisabled && canSelectMore;

        return (
          <motion.button
            key={num}
            className="relative rounded-lg font-mono font-bold"
            style={{
              width: config.buttonSize,
              height: config.buttonSize,
              fontSize: config.fontSize,
              fontFamily: "'VT323', monospace",
              background: isSelected
                ? `linear-gradient(145deg, ${colors.active}40, ${rawColors.bgDark})`
                : rawColors.bgDark,
              border: `2px solid ${
                isSelected
                  ? colors.active
                  : isDisabled
                    ? rawColors.metalDark
                    : rawColors.teamFriendlyDim
              }`,
              color: isSelected
                ? colors.text
                : isDisabled
                  ? rawColors.metalDark
                  : rawColors.teamFriendlyDim,
              boxShadow: isSelected
                ? `0 0 15px ${colors.active}40, inset 0 0 10px ${colors.active}20`
                : 'inset 0 2px 5px rgba(0,0,0,0.3)',
              cursor: isAvailable ? 'pointer' : 'not-allowed',
              opacity: isDisabled ? 0.4 : 1,
            }}
            whileHover={
              isAvailable
                ? {
                    scale: 1.05,
                    borderColor: colors.active,
                    boxShadow: `0 0 10px ${colors.active}40`,
                  }
                : {}
            }
            whileTap={
              isAvailable
                ? {
                    scale: 0.95,
                  }
                : {}
            }
            onClick={() => handleSelect(num)}
            disabled={!isAvailable}
          >
            {/* Scanline effect */}
            <div
              className="absolute inset-0 pointer-events-none rounded-md opacity-20"
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

            {/* Number */}
            <span
              className="relative z-10"
              style={{
                textShadow: isSelected
                  ? `0 0 10px ${colors.text}, 0 0 20px ${colors.text}`
                  : 'none',
              }}
            >
              {num}
            </span>

            {/* Selection order indicator */}
            {isSelected && (
              <motion.div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: colors.active,
                  color: rawColors.bgDark,
                  boxShadow: `0 0 8px ${colors.active}`,
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                {selectedNumbers.indexOf(num) + 1}
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export default NumberPad;
