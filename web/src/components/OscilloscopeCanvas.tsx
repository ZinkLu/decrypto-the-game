import { useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

export type OscilloscopeState = 'active' | 'completed' | 'waiting';

/**
 * 波形配置
 */
const waveConfig = {
  active: {
    color: '#00ff88',
    borderColor: '#00ff88',
    amplitude: 25,
    frequency: 0.05,
    speed: 1.5,
    glowIntensity: 10,
  },
  completed: {
    color: '#3d5544',
    borderColor: '#3d5544',
    amplitude: 8,
    frequency: 0.02,
    speed: 0.3,
    glowIntensity: 3,
  },
  waiting: {
    color: '#1a2f1a',
    borderColor: '#1a2f1a',
    amplitude: 2,
    frequency: 0,
    speed: 0,
    glowIntensity: 0,
  },
};

interface OscilloscopeCanvasProps {
  width?: number;
  height?: number;
  state?: OscilloscopeState;
  showGrid?: boolean;
  showCenterLine?: boolean;
}

export function OscilloscopeCanvas({
  width = 200,
  height = 80,
  state = 'waiting',
  showGrid = true,
  showCenterLine = true,
}: OscilloscopeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animationRef = useRef<number>(0);

  const config = waveConfig[state];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清除画布（带拖尾效果）
    ctx.fillStyle = 'rgba(10, 15, 10, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格
    if (showGrid) {
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.08)';
      ctx.lineWidth = 1;

      for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // 绘制中心线
    if (showCenterLine) {
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    // 绘制波形
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = config.color;
    ctx.shadowBlur = config.glowIntensity;

    ctx.beginPath();

    if (state === 'waiting') {
      // 等待状态：近乎平直线，偶尔有微弱噪点
      const noiseChance = Math.random();
      if (noiseChance > 0.95) {
        // 偶尔闪过微弱噪点
        const noiseX = Math.random() * width;
        const noiseY = height / 2 + (Math.random() - 0.5) * 10;
        ctx.moveTo(noiseX - 5, noiseY);
        ctx.lineTo(noiseX + 5, noiseY);
      } else {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      }
    } else if (state === 'active') {
      // 活跃状态：不规则波形，模拟打字节奏
      for (let x = 0; x < width; x += 2) {
        // 结合多个正弦波产生不规则波形
        const baseFreq = config.frequency + (Math.sin(x * 0.01) * 0.02);
        const y1 = Math.sin(x * baseFreq + timeRef.current * config.speed) * config.amplitude;
        const y2 = Math.sin(x * baseFreq * 0.5 + timeRef.current * 1.2) * (config.amplitude * 0.4);
        const y3 = Math.sin(x * baseFreq * 2 + timeRef.current * 0.8) * (config.amplitude * 0.2);

        // 添加随机噪点模拟打字节奏
        const noise = Math.random() > 0.9 ? (Math.random() - 0.5) * 5 : 0;

        const y = height / 2 + y1 + y2 + y3 + noise;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    } else {
      // 完成状态：稳定的低频正弦波
      for (let x = 0; x < width; x += 2) {
        const y = height / 2 + Math.sin(x * config.frequency + timeRef.current * config.speed) * config.amplitude;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // 活跃状态下的扫描光效
    if (state === 'active') {
      const glowX = (timeRef.current * config.speed * 8) % (width + 60) - 30;
      if (glowX < width && glowX > 0) {
        const gradient = ctx.createLinearGradient(glowX, 0, glowX + 40, 0);
        gradient.addColorStop(0, `${config.color}30`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(glowX, 0, 40, height);
      }
    }

    timeRef.current += 0.03;
    animationRef.current = requestAnimationFrame(draw);
  }, [width, height, state, config, showGrid, showCenterLine]);

  useEffect(() => {
    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded"
        style={{
          background: '#0a0f0a',
          border: `1px solid ${config.borderColor}`,
        }}
      />
      {/* 角落标记 */}
      <div
        className="absolute top-0 left-0 w-2 h-2 border-l border-t"
        style={{ borderColor: config.borderColor, opacity: 0.5 }}
      />
      <div
        className="absolute top-0 right-0 w-2 h-2 border-r border-t"
        style={{ borderColor: config.borderColor, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-0 left-0 w-2 h-2 border-l border-b"
        style={{ borderColor: config.borderColor, opacity: 0.5 }}
      />
      <div
        className="absolute bottom-0 right-0 w-2 h-2 border-r border-b"
        style={{ borderColor: config.borderColor, opacity: 0.5 }}
      />
    </div>
  );
}

interface WaveformWindowProps {
  index: number;
  state: OscilloscopeState;
  statusText: string;
  showCheckmark?: boolean;
  width?: number;
  height?: number;
}

/**
 * 波形窗口组件 - 单个示波器窗口，包含波形、编号和状态文字
 */
export function WaveformWindow({
  index,
  state,
  statusText,
  showCheckmark = false,
  width = 200,
  height = 80,
}: WaveformWindowProps) {
  const config = waveConfig[state];

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      {/* 波形显示区域 */}
      <OscilloscopeCanvas
        width={width}
        height={height}
        state={state}
        showGrid={state !== 'waiting'}
        showCenterLine={state !== 'waiting'}
      />

      {/* 编号和状态 */}
      <div className="mt-2 text-center">
        <div
          className="text-sm font-mono"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
            textShadow: `0 0 5px ${config.color}`,
          }}
        >
          #{index} {showCheckmark && '✓'}
        </div>
        <div
          className="text-xs font-mono opacity-70"
          style={{
            fontFamily: "'VT323', monospace",
            color: config.color,
          }}
        >
          {statusText}
        </div>
      </div>
    </motion.div>
  );
}

export default OscilloscopeCanvas;
