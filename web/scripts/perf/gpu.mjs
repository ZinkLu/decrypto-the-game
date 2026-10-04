// Busy time of one process on the GPU (ns), from IOAccelerator AppUsage. No sudo.
// Busy % is not power: the governor holds it near 20–50% by moving the clock. Read watts from iowin.py.
import { execFileSync } from 'node:child_process';

export function gpuTimes() {
  const out = execFileSync('ioreg', ['-r', '-c', 'IOAccelerator', '-l', '-w', '0', '-d', '3'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const usage = new Map();
  let pending = null;
  // Each client block lists AppUsage before IOUserClientCreator.
  for (const line of out.split('\n')) {
    let m = line.match(/"AppUsage" = \((.*)\)/);
    if (m) { pending = [...m[1].matchAll(/"accumulatedGPUTime"=(\d+)/g)].reduce((a, x) => a + Number(x[1]), 0); continue; }
    m = line.match(/"IOUserClientCreator" = "pid (\d+), /);
    if (m && pending !== null) { usage.set(Number(m[1]), (usage.get(Number(m[1])) ?? 0) + pending); pending = null; }
  }
  return usage;
}

/** The pids of the browser's GPU process, where WebGL, 2D canvases and the compositor all run. */
export async function gpuPids(browser) {
  const info = await browser.send('SystemInfo.getProcessInfo');
  return info.processInfo.filter(p => p.type === 'GPU').map(p => p.id);
}

export const sumFor = (usage, pids) => pids.reduce((a, p) => a + (usage.get(p) ?? 0), 0);
