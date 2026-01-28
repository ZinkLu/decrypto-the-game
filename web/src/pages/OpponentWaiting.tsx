import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CRTContainer } from '../components/CRTContainer';
import { CRTPanel } from '../components/CRTContainer';
import { CountdownTimer } from '../components/CountdownTimer';
import { WaveformWindow, OscilloscopeState } from '../components/OscilloscopeCanvas';
import { MascotDesktop, MascotMobile, MascotProgress } from '../components/Mascot';
import { TensionLevel } from '../components/CRTContainer';

// 模拟数据
interface OpponentData {
  name: string;
  avatar?: string;
}

interface WaveformState {
  id: number;
  state: OscilloscopeState;
  statusText: string;
}

// 紧张度配置 - 对手视角使用不同颜色
const opponentTensionConfig = {
  normal: {
    bg: '#1a2a3a',
    text: '#00aaff',
    progressBar: '#00aaff',
    borderColor: '#2a4a6a',
    mascotColor: '#00aaff',
  },
  warning: {
    bg: '#2a2a3a',
    text: '#88ccff',
    progressBar: '#88ccff',
    borderColor: '#4a5a7a',
    mascotColor: '#88ccff',
  },
  tense: {
    bg: '#2a1a2a',
    text: '#ff88aa',
    progressBar: '#ff88aa',
    borderColor: '#5a3a4a',
    mascotColor: '#ff88aa',
  },
  critical: {
    bg: '#3a1a1a',
    text: '#ff4444',
    progressBar: '#ff4444',
    borderColor: '#6a2a2a',
    mascotColor: '#ff4444',
  },
};

export default function OpponentWaiting() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [tension, setTension] = useState<TensionLevel>('normal');
  const [completedCount, setCompletedCount] = useState(0);
  const [waveforms, setWaveforms] = useState<WaveformState[]>([
    { id: 1, state: 'active', statusText: '分析中' },
    { id: 2, state: 'waiting', statusText: '等待中' },
    { id: 3, state: 'waiting', statusText: '等待中' },
  ]);

  // 模拟对手数据
  const opponent: OpponentData = {
    name: '对手',
  };

  // 计算紧张度
  useEffect(() => {
    if (timeLeft > 30) {
      setTension('normal');
    } else if (timeLeft > 15) {
      setTension('warning');
    } else if (timeLeft > 5) {
      setTension('tense');
    } else {
      setTension('critical');
    }
  }, [timeLeft]);

  // 倒计时
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // 模拟波形状态变化
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 1 ? { ...w, state: 'completed' as OscilloscopeState, statusText: '已截获' } : w
        )
      );
      setCompletedCount(1);
    }, 5000);

    const timer2 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 2 ? { ...w, state: 'completed' as OscilloscopeState, statusText: '已截获' } : w
        )
      );
      setCompletedCount(2);
    }, 10000);

    const timer3 = setTimeout(() => {
      setWaveforms((prev) =>
        prev.map((w) =>
          w.id === 3 ? { ...w, state: 'completed' as OscilloscopeState, statusText: '已截获' } : w
        )
      );
      setCompletedCount(3);
    }, 15000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // 根据完成数量确定吉祥物状态
  const getMascotProgress = (): MascotProgress => {
    if (completedCount === 0) return 'waiting';
    if (completedCount === 1) return 'received';
    if (completedCount === 2) return 'almost';
    return 'ready';
  };

  const config = opponentTensionConfig[tension];
  const mascotProgress = getMascotProgress();

  return (
    <div
      className="relative w-full h-full overflow-hidden transition-colors duration-1000"
      style={{
        background: `linear-gradient(180deg, ${config.bg} 0%, #0a0f1a 100%)`,
      }}
    >
      {/* CRT 扫描线 */}
      <CRTContainer showScanlines={true} showVignette={true} showReflection={true} intensity="medium">
        <div className="relative z-10 h-full flex flex-col">
          {/* 顶部区域：倒计时 */}
          <div className="flex flex-col items-center pt-6">
            <CountdownTimer totalSeconds={timeLeft} showProgressBar={true} size="medium" />
          </div>

          {/* 对手信息区 */}
          <div className="flex flex-col items-center mt-4">
            <div className="flex items-center gap-3">
              {/* 头像/图标 */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(145deg, #2a4a6a, #1a2a3a)',
                  border: `2px solid ${config.text}`,
                  boxShadow: `0 0 10px ${config.text}40`,
                }}
              >
                <span className="text-xl">🎯</span>
              </div>

              {/* 名字和状态 */}
              <span
                className="text-lg font-mono"
                style={{
                  fontFamily: "'VT323', monospace",
                  color: config.text,
                  textShadow: `0 0 10px ${config.text}`,
                }}
              >
                {opponent.name} 正在加密...
              </span>
            </div>

            {/* 省略号动画 */}
            <motion.span
              className="text-lg font-mono"
              style={{
                fontFamily: "'VT323', monospace",
                color: config.text,
              }}
              animate={{
                opacity: [1, 0, 1, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
            >
              ...
            </motion.span>
          </div>

          {/* 示波器指示区 */}
          <div className="flex-1 flex flex-col items-center mt-6">
            {/* CRT 外框 */}
            <CRTPanel
              className="w-full max-w-4xl mx-4 p-4"
              borderColor={config.borderColor}
              background="#0a0f1a"
            >
              <CRTContainer showScanlines={true} showVignette={true} showReflection={false} intensity="low">
                {/* 桌面端：3列布局 */}
                <div className="hidden lg:flex justify-center gap-8 py-4">
                  {waveforms.map((waveform) => (
                    <WaveformWindow
                      key={waveform.id}
                      index={waveform.id}
                      state={waveform.state}
                      statusText={waveform.statusText}
                      showCheckmark={waveform.state === 'completed'}
                      width={220}
                      height={90}
                    />
                  ))}
                </div>

                {/* 移动端：2+1 布局 */}
                <div className="lg:hidden flex flex-col items-center gap-4 py-4">
                  {/* 第一行：2个波形 */}
                  <div className="flex justify-center gap-4">
                    {waveforms.slice(0, 2).map((waveform) => (
                      <WaveformWindow
                        key={waveform.id}
                        index={waveform.id}
                        state={waveform.state}
                        statusText={waveform.statusText}
                        showCheckmark={waveform.state === 'completed'}
                        width={140}
                        height={70}
                      />
                    ))}
                  </div>

                  {/* 第二行：1个波形 */}
                  <div className="flex justify-center">
                    {waveforms.slice(2, 3).map((waveform) => (
                      <WaveformWindow
                        key={waveform.id}
                        index={waveform.id}
                        state={waveform.state}
                        statusText={waveform.statusText}
                        showCheckmark={waveform.state === 'completed'}
                        width={140}
                        height={70}
                      />
                    ))}
                  </div>
                </div>
              </CRTContainer>
            </CRTPanel>
          </div>

          {/* 底部吉祥物区域 */}
          <div className="h-32 flex items-end justify-center pb-4">
            {/* 桌面端 */}
            <div className="hidden lg:block w-full max-w-md mx-auto">
              <MascotDesktop
                progress={mascotProgress}
                completedCount={completedCount}
                tension={tension}
              />
            </div>

            {/* 移动端 */}
            <div className="lg:hidden w-full max-w-xs mx-auto px-4">
              <MascotMobile
                progress={mascotProgress}
                completedCount={completedCount}
                tension={tension}
              />
            </div>
          </div>

          {/* 装饰：设备边框螺丝 */}
          <div className="absolute top-4 left-4 w-3 h-3 screw opacity-50" />
          <div className="absolute top-4 right-4 w-3 h-3 screw opacity-50" />
          <div className="absolute bottom-4 left-4 w-3 h-3 screw opacity-50" />
          <div className="absolute bottom-4 right-4 w-3 h-3 screw opacity-50" />
        </div>
      </CRTContainer>

      {/* 紧急情况下的红色脉冲 */}
      {tension === 'critical' && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          animate={{
            opacity: [0, 0.15, 0],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
          }}
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255, 68, 68, 0.3), transparent 70%)',
          }}
        />
      )}
    </div>
  );
}
