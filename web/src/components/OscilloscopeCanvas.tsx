import { useEffect, useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { waveConfig, rawColors } from '../theme/colors';

export type OscilloscopeState = 'active' | 'completed' | 'waiting' | 'boot';

interface OscilloscopeCanvasProps {
  width?: number;
  height?: number;
  state?: OscilloscopeState;
  showGrid?: boolean;
  showCenterLine?: boolean;
  onBootComplete?: () => void;
}

export function OscilloscopeCanvas({
  width = 200,
  height = 80,
  state = 'waiting',
  showGrid = true,
  showCenterLine = true,
  onBootComplete,
}: OscilloscopeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animationRef = useRef<number>(0);
  const bootStartRef = useRef<number | null>(null);
  const [bootPhase, setBootPhase] = useState<'off' | 'warming' | 'line' | 'expanding' | 'ready'>('off');

  // 对于 boot 状态，使用 waiting 的配置作为基础
  const config = state === 'boot' ? waveConfig['waiting'] : waveConfig[state];

  // 启动 boot 动画
  useEffect(() => {
    if (state === 'boot' && bootStartRef.current === null) {
      bootStartRef.current = Date.now();
      setBootPhase('warming');

      // Boot 动画时序
      const timers = [
        setTimeout(() => setBootPhase('line'), 100),
        setTimeout(() => setBootPhase('expanding'), 400),
        setTimeout(() => {
          setBootPhase('ready');
          onBootComplete?.();
        }, 1000),
      ];

      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [state, onBootComplete]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Boot 状态的特殊绘制
    if (state === 'boot') {
      // 清除画布
      ctx.fillStyle = rawColors.crtScreen;
      ctx.fillRect(0, 0, width, height);

      if (bootPhase === 'off') {
        // 完全黑屏
        return;
      }

      if (bootPhase === 'warming') {
        // 预热：中心微弱亮点
        const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, 10);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      if (bootPhase === 'line') {
        // 中心亮线出现
        const lineWidth = Math.min((Date.now() - (bootStartRef.current || 0) - 100) / 300 * width, width);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo((width - lineWidth) / 2, height / 2);
        ctx.lineTo((width + lineWidth) / 2, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (bootPhase === 'expanding' || bootPhase === 'ready') {
        // 网格渐显
        const gridOpacity = Math.min((Date.now() - (bootStartRef.current || 0) - 400) / 400, 1) * 0.08;
        ctx.strokeStyle = `rgba(0, 255, 136, ${gridOpacity})`;
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

        // 中心线
        ctx.strokeStyle = `rgba(0, 255, 136, ${gridOpacity * 2})`;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // 波形开始显示
        if (bootPhase === 'ready') {
          const waveOpacity = Math.min((Date.now() - (bootStartRef.current || 0) - 800) / 200, 1);
          ctx.strokeStyle = `rgba(0, 255, 136, ${waveOpacity})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();
        }
      }

      timeRef.current += 0.03;
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

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
      // 活跃状态：增强的不规则波形，模拟打字节奏

      // 打字脉冲效果 - 周期性的振幅增加
      const typingPulse = Math.sin(timeRef.current * 3) > 0.6 ? 1.3 : 1;
      // 颜色呼吸效果
      const breathIntensity = 0.8 + Math.sin(timeRef.current * 0.5) * 0.2;

      // 动态调整颜色亮度
      const r = Math.floor(parseInt(config.color.slice(1, 3), 16) * breathIntensity);
      const g = Math.floor(Math.min(255, parseInt(config.color.slice(3, 5), 16) * breathIntensity));
      const b = Math.floor(parseInt(config.color.slice(5, 7), 16) * breathIntensity);
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

      for (let x = 0; x < width; x += 2) {
        // 结合多个正弦波产生不规则波形
        const baseFreq = config.frequency + (Math.sin(x * 0.01) * 0.02);
        const y1 = Math.sin(x * baseFreq + timeRef.current * config.speed) * config.amplitude * typingPulse;
        const y2 = Math.sin(x * baseFreq * 0.5 + timeRef.current * 1.2) * (config.amplitude * 0.4);
        const y3 = Math.sin(x * baseFreq * 2 + timeRef.current * 0.8) * (config.amplitude * 0.2);

        // 增强的随机噪点模拟打字节奏
        const noise = Math.random() > 0.85 ? (Math.random() - 0.5) * 8 : 0;

        // 打字脉冲时额外的噪点
        const pulseNoise = typingPulse > 1 && Math.random() > 0.7
          ? (Math.random() - 0.5) * 6
          : 0;

        const y = height / 2 + y1 + y2 + y3 + noise + pulseNoise;
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

    // 活跃状态下的增强扫描光效
    if (state === 'active') {
      const glowX = (timeRef.current * config.speed * 8) % (width + 80) - 40;

      // 主扫描光束
      if (glowX < width && glowX > -40) {
        const mainGradient = ctx.createLinearGradient(glowX, 0, glowX + 50, 0);
        mainGradient.addColorStop(0, 'transparent');
        mainGradient.addColorStop(0.3, `${config.color}40`);
        mainGradient.addColorStop(0.7, `${config.color}50`);
        mainGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = mainGradient;
        ctx.fillRect(glowX, 0, 50, height);
      }

      // 余晖效果（扫描后的淡淡光尾）
      const trailX = glowX - 30;
      if (trailX < width && trailX > -60) {
        const trailGradient = ctx.createLinearGradient(trailX, 0, trailX + 60, 0);
        trailGradient.addColorStop(0, 'transparent');
        trailGradient.addColorStop(0.5, `${config.color}15`);
        trailGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = trailGradient;
        ctx.fillRect(trailX, 0, 60, height);
      }

      // 扫描线前的微弱预热光
      const preGlowX = glowX + 45;
      if (preGlowX < width && preGlowX > 0) {
        const preGradient = ctx.createLinearGradient(preGlowX, 0, preGlowX + 20, 0);
        preGradient.addColorStop(0, `${config.color}08`);
        preGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = preGradient;
        ctx.fillRect(preGlowX, 0, 20, height);
      }
    }

    timeRef.current += 0.03;
    animationRef.current = requestAnimationFrame(draw);
  }, [width, height, state, config, showGrid, showCenterLine, bootPhase]);

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
          background: rawColors.crtScreen,
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
  onBootComplete?: () => void;
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
  onBootComplete,
}: WaveformWindowProps) {
  // 对于 boot 状态，使用 waiting 的配置
  const config = state === 'boot' ? waveConfig['waiting'] : waveConfig[state];

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
        showGrid={state !== 'waiting' && state !== 'boot'}
        showCenterLine={state !== 'waiting' && state !== 'boot'}
        onBootComplete={onBootComplete}
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
