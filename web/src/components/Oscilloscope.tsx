import { useEffect, useRef } from 'react';

interface OscilloscopeProps {
  width?: number;
  height?: number;
  color?: string;
  speed?: number;
  amplitude?: number;
  frequency?: number;
}

export function Oscilloscope({
  width = 400,
  height = 100,
  color = '#00ff88',
  speed = 1,
  amplitude = 30,
  frequency = 0.02
}: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      ctx.fillStyle = 'rgba(10, 15, 10, 0.3)';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.1)';
      ctx.lineWidth = 1;

      // Horizontal grid lines
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical grid lines
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw center line
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw waveform
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      ctx.beginPath();

      for (let x = 0; x < width; x += 2) {
        // Combine multiple sine waves for interesting pattern
        const y1 = Math.sin(x * frequency + timeRef.current) * amplitude;
        const y2 = Math.sin(x * frequency * 0.5 + timeRef.current * 1.5) * (amplitude * 0.5);
        const y3 = Math.sin(x * frequency * 2 + timeRef.current * 0.7) * (amplitude * 0.3);

        const y = height / 2 + y1 + y2 + y3;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw glow at the leading edge
      const glowX = (timeRef.current * speed * 5) % (width + 100) - 50;
      if (glowX < width) {
        const gradient = ctx.createLinearGradient(glowX, 0, glowX + 50, 0);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.5)');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(glowX, 0, 50, height);
      }

      timeRef.current += 0.05 * speed;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [width, height, color, speed, amplitude, frequency]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded border border-[#3d5544]"
        style={{ background: '#0a0f0a' }}
      />
      {/* Corner markers */}
      <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-[#00ff88] opacity-50" />
      <div className="absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2 border-[#00ff88] opacity-50" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-l-2 border-b-2 border-[#00ff88] opacity-50" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-[#00ff88] opacity-50" />
    </div>
  );
}
