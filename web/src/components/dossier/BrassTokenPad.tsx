import { motion } from 'framer-motion';
import { rawColors, TensionLevel } from '../../theme/colors';

interface BrassTokenPadProps {
  onNumberSelect: (num: number) => void;
  selectedNumbers?: number[];
  disabledNumbers?: number[];
  maxSelections?: number;
  range?: [number, number];
  tension?: TensionLevel;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeConfig = {
  small: { buttonSize: '40px', fontSize: '1.25rem', gap: '8px' },
  medium: { buttonSize: '56px', fontSize: '1.5rem', gap: '12px' },
  large: { buttonSize: '72px', fontSize: '2rem', gap: '16px' },
};

const tensionColors: Record<TensionLevel, { active: string; text: string }> = {
  normal: { active: rawColors.brass, text: rawColors.navyDark },
  warning: { active: rawColors.brassLight, text: rawColors.navyDark },
  tense: { active: rawColors.intelRed, text: rawColors.cream },
  critical: { active: rawColors.tensionCriticalText, text: rawColors.cream },
};

export function BrassTokenPad({
  onNumberSelect,
  selectedNumbers = [],
  disabledNumbers = [],
  maxSelections = 3,
  range = [1, 4],
  tension = 'normal',
  size = 'medium',
  className = '',
}: BrassTokenPadProps) {
  const [min, max] = range;
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const config = sizeConfig[size];
  const tColors = tensionColors[tension];
  const canSelectMore = selectedNumbers.length < maxSelections;

  const handleSelect = (num: number) => {
    if (disabledNumbers.includes(num)) return;
    if (selectedNumbers.includes(num)) return;
    if (!canSelectMore) return;
    onNumberSelect(num);
  };

  return (
    <div className={`flex ${className}`} style={{ gap: config.gap }}>
      {numbers.map((num) => {
        const isSelected = selectedNumbers.includes(num);
        const isDisabled = disabledNumbers.includes(num);
        const isAvailable = !isSelected && !isDisabled && canSelectMore;

        return (
          <motion.button
            key={num}
            aria-label={`Select number ${num}`}
            className="relative rounded-full font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brass)]"
            style={{
              width: config.buttonSize,
              height: config.buttonSize,
              fontSize: config.fontSize,
              fontFamily: "'Bebas Neue', sans-serif",
              background: isSelected
                ? `radial-gradient(circle at 35% 35%, ${tColors.active}, ${rawColors.brassDim})`
                : `radial-gradient(circle at 35% 35%, ${rawColors.brassLight}, ${rawColors.brass}, ${rawColors.brassDim})`,
              color: isSelected ? tColors.text : rawColors.navyDark,
              border: isSelected
                ? `3px solid ${tColors.active}`
                : `2px solid ${rawColors.brassDim}`,
              boxShadow: isSelected
                ? `0 0 12px ${tColors.active}60, inset 0 2px 4px rgba(255,255,255,0.2)`
                : 'inset 0 2px 4px rgba(255,255,255,0.15), 0 2px 6px rgba(0,0,0,0.4)',
              cursor: isAvailable ? 'pointer' : 'not-allowed',
              opacity: isDisabled ? 0.4 : 1,
            }}
            whileHover={isAvailable ? { scale: 1.08, boxShadow: `0 0 15px ${rawColors.brass}60` } : {}}
            whileTap={isAvailable ? { scale: 0.92 } : {}}
            onClick={() => handleSelect(num)}
            disabled={!isAvailable}
          >
            <span className="relative z-10">{num}</span>

            {isSelected && (
              <motion.div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: tColors.active,
                  color: tColors.text,
                  boxShadow: `0 0 6px ${tColors.active}`,
                  fontFamily: "'Courier Prime', monospace",
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

export default BrassTokenPad;
