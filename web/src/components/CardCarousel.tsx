import { ReactNode, useRef } from 'react';
import { motion, useMotionValue, animate, PanInfo, MotionValue } from 'framer-motion';

interface CardCarouselProps<T> {
  items: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  renderItem: (item: T, index: number, isActive: boolean) => ReactNode;
  cardWidth?: number;
  peekAmount?: number;
  gap?: number;
}

export function CardCarousel<T>({
  items,
  currentIndex,
  onIndexChange,
  renderItem,
  cardWidth = 320,
  peekAmount = 0.15,
  gap = 16,
}: CardCarouselProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const isDragging = useRef(false);

  // Calculate the offset for centering current card
  const getTargetX = (index: number) => {
    return -index * (cardWidth + gap);
  };

  // Animate to target position
  const animateToIndex = (index: number) => {
    const targetX = getTargetX(index);
    animate(x, targetX, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
  };

  // Handle drag end
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    isDragging.current = false;
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    let newIndex = currentIndex;

    // Determine direction based on velocity and offset
    if (Math.abs(velocity) > 500 || Math.abs(offset) > cardWidth * 0.3) {
      if (velocity > 0 || offset > 0) {
        newIndex = Math.max(0, currentIndex - 1);
      } else {
        newIndex = Math.min(items.length - 1, currentIndex + 1);
      }
    }

    if (newIndex !== currentIndex) {
      onIndexChange(newIndex);
    }
    animateToIndex(newIndex);
  };

  // Update position when currentIndex changes externally
  const handleIndexChange = () => {
    if (!isDragging.current) {
      animateToIndex(currentIndex);
    }
  };

  // Watch for external index changes
  if (!isDragging.current && x.get() !== getTargetX(currentIndex)) {
    handleIndexChange();
  }

  // Calculate peek width
  const peekWidth = cardWidth * peekAmount;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{
        // Container width = card + 2 * peek
        maxWidth: cardWidth + peekWidth * 2 + gap * 2,
        margin: '0 auto',
      }}
    >
      <motion.div
        className="flex items-center"
        style={{
          x,
          paddingLeft: peekWidth + gap,
          paddingRight: peekWidth + gap,
        }}
        drag="x"
        dragConstraints={{
          left: getTargetX(items.length - 1) - 50,
          right: getTargetX(0) + 50,
        }}
        dragElastic={0.1}
        onDragStart={() => {
          isDragging.current = true;
        }}
        onDragEnd={handleDragEnd}
      >
        {items.map((item, index) => {
          const isActive = index === currentIndex;
          const distance = index - currentIndex;

          return (
            <CardItem
              key={index}
              index={index}
              isActive={isActive}
              distance={distance}
              cardWidth={cardWidth}
              gap={gap}
              x={x}
              currentIndex={currentIndex}
            >
              {renderItem(item, index, isActive)}
            </CardItem>
          );
        })}
      </motion.div>

      {/* Navigation arrows for desktop */}
      <div className="hidden lg:block">
        {currentIndex > 0 && (
          <motion.button
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2"
            onClick={() => onIndexChange(currentIndex - 1)}
            whileHover={{ scale: 1.2, x: -2 }}
            whileTap={{ scale: 0.9 }}
            style={{ color: '#00ff88' }}
          >
            <span className="text-4xl font-bold" style={{ textShadow: '0 0 10px #00ff88' }}>
              ‹
            </span>
          </motion.button>
        )}
        {currentIndex < items.length - 1 && (
          <motion.button
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2"
            onClick={() => onIndexChange(currentIndex + 1)}
            whileHover={{ scale: 1.2, x: 2 }}
            whileTap={{ scale: 0.9 }}
            style={{ color: '#00ff88' }}
          >
            <span className="text-4xl font-bold" style={{ textShadow: '0 0 10px #00ff88' }}>
              ›
            </span>
          </motion.button>
        )}
      </div>

      {/* Swipe hint for mobile */}
      <div className="lg:hidden text-center mt-2">
        <span
          className="text-xs font-mono opacity-50"
          style={{
            fontFamily: "'VT323', monospace",
            color: '#3d5544',
          }}
        >
          ← 滑动切换 →
        </span>
      </div>
    </div>
  );
}

interface CardItemProps {
  children: ReactNode;
  index: number;
  isActive: boolean;
  distance: number;
  cardWidth: number;
  gap: number;
  x: MotionValue<number>;
  currentIndex: number;
}

function CardItem({
  children,
  isActive,
  distance,
  cardWidth,
  gap,
}: CardItemProps) {
  // Calculate visual properties based on distance from active card
  const absDistance = Math.abs(distance);
  const scale = isActive ? 1 : Math.max(0.85, 1 - absDistance * 0.1);
  const opacity = isActive ? 1 : Math.max(0.6, 1 - absDistance * 0.3);
  const blur = isActive ? 0 : Math.min(2, absDistance * 1);
  const zIndex = 10 - absDistance;

  // 3D rotation for depth effect
  const rotateY = distance * -5;

  return (
    <motion.div
      className="flex-shrink-0"
      style={{
        width: cardWidth,
        marginRight: gap,
        zIndex,
      }}
      animate={{
        scale,
        opacity,
        rotateY,
        filter: `blur(${blur}px)`,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      {/* Card shadow for depth */}
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{
          background: 'rgba(0, 0, 0, 0.3)',
          transform: 'translateY(4px)',
          filter: 'blur(8px)',
        }}
        animate={{
          opacity: isActive ? 0.5 : 0.2,
        }}
      />

      {/* Card content */}
      <div className="relative">
        {children}

        {/* Inactive overlay */}
        {!isActive && (
          <motion.div
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%)',
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

export default CardCarousel;
