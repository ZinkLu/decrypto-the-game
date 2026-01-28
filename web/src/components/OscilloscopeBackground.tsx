import { useEffect, useRef, useState } from 'react';

interface OscilloscopeBackgroundProps {
  speed?: number;
  density?: number;
  color?: string;
}

export function OscilloscopeBackground({
  speed = 1,
  density = 40,
  color = '#00ff88'
}: OscilloscopeBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      // Fade effect
      ctx.fillStyle = 'rgba(10, 15, 10, 0.15)';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Draw grid
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.05)';
      ctx.lineWidth = 1;

      // Horizontal lines
      for (let y = 0; y < dimensions.height; y += density) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
        ctx.stroke();
      }

      // Vertical lines
      for (let x = 0; x < dimensions.width; x += density * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
        ctx.stroke();
      }

      // Draw multiple waveform lines
      const waveforms = [
        { offset: 0, amplitude: 40, frequency: 0.015 },
        { offset: Math.PI / 2, amplitude: 30, frequency: 0.02 },
        { offset: Math.PI, amplitude: 20, frequency: 0.01 }
      ];

      waveforms.forEach((wave, index) => {
        ctx.strokeStyle = index === 0 ? color : `rgba(0, 255, 136, ${0.3 - index * 0.1})`;
        ctx.lineWidth = index === 0 ? 2 : 1;
        ctx.shadowColor = color;
        ctx.shadowBlur = index === 0 ? 10 : 0;

        ctx.beginPath();

        for (let x = 0; x < dimensions.width; x += 3) {
          const y =
            dimensions.height / 2 +
            Math.sin(x * wave.frequency + timeRef.current + wave.offset) * wave.amplitude +
            Math.sin(x * wave.frequency * 0.5 + timeRef.current * 0.5) * (wave.amplitude * 0.5);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      });

      ctx.shadowBlur = 0;

      // Draw scan line effect
      const scanY = (timeRef.current * 2) % dimensions.height;
      const scanGradient = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
      scanGradient.addColorStop(0, 'transparent');
      scanGradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.1)');
      scanGradient.addColorStop(1, 'transparent');

      ctx.fillStyle = scanGradient;
      ctx.fillRect(0, scanY - 20, dimensions.width, 40);

      timeRef.current += 0.03 * speed;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [dimensions, speed, density, color]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="fixed top-0 left-0 w-full h-full -z-10"
    />
  );
}
