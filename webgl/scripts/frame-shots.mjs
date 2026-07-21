// Framing check: screenshot the home view at several window sizes.
// Usage: node webgl/scripts/frame-shots.mjs   (server must be running)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = '/tmp/decrypto-shots';
const APP = 'http://localhost:8080/';
const CDP_PORT = 9334;
const SIZES = [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [900, 700], // narrow: camera zooms onto the main CRT
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--user-data-dir=/tmp/decrypto-cdp-framing',
  '--use-angle=swiftshader',
  '--hide-scrollbars',
  'about:blank',
]);
process.on('exit', () => chrome.kill());

let version = null;
for (let i = 0; i < 40; i++) {
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    break;
  } catch {
    await sleep(250);
  }
}
if (!version) {
  console.error('FAIL: chrome CDP did not come up');
  process.exit(1);
}

const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(APP)}`, { method: 'PUT' })
).json();
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (cdp.onopen = r));

let msgId = 0;
const pending = new Map();
cdp.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const cdpSend = (method, params = {}) => {
  const id = ++msgId;
  cdp.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
};

await cdpSend('Page.enable');
await cdpSend('Runtime.enable');

for (const [w, h] of SIZES) {
  await cdpSend('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(3500); // let the scene render + settle
  const res = await cdpSend('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/frame-${w}x${h}.png`, Buffer.from(res.result.data, 'base64'));
  console.log(`shot: frame-${w}x${h}`);
}
chrome.kill();
console.log('PASS: framing shots captured');
process.exit(0);
