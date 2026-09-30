// A minimal CDP client for the probes: one browser connection, pages in their own contexts.
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The engine as the DEV build exposes it to these probes. */
export const ENGINE = 'window.__consoleEngine';

export async function connect(port = Number(process.env.CDP_PORT ?? 9555)) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const waiting = new Map(), listeners = new Set();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} ${message.error.data ?? ''}`));
      else resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  // A crashed run leaves its console drawing in the background, which spoils every later measurement.
  // One probe runs at a time: close whatever pages are still open.
  const { targetInfos } = await send('Target.getTargets');
  for (const target of targetInfos) if (target.type === 'page' && target.url !== 'about:blank') await send('Target.closeTarget', { targetId: target.targetId });
  return { send, listeners, close: () => socket.close() };
}

/** A page in a fresh browser context, so no storage leaks between runs. `storage` is written to localStorage before load. */
export async function openPage(browser, { width = 1440, height = 900, scale = 2, reduced = false, storage = {} } = {}) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  const problems = [];
  const listener = message => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown')
      problems.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type))
      problems.push(message.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  browser.listeners.add(listener);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  if (Object.keys(storage).length) await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(k, v); } catch {}` });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  };
  const waitFor = async (expression, timeout = 30000, label = expression) => {
    for (const started = Date.now(); Date.now() - started < timeout; await sleep(100)) if (await evaluate(expression)) return;
    throw new Error(`timed out waiting for ${label}`);
  };
  return {
    send, evaluate, waitFor, problems,
    navigate: url => send('Page.navigate', { url }),
    screenshot: async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    async close() {
      browser.listeners.delete(listener);
      await browser.send('Target.closeTarget', { targetId });
      await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    },
  };
}

/** Loads a console URL and waits until the model is in and the DEV engine handle is there. */
export async function openConsole(browser, url, options) {
  const page = await openPage(browser, options);
  await page.navigate(url);
  await page.waitFor(`!!document.querySelector('.station-stage canvas') && !document.querySelector('.station-loading') && !!${ENGINE}?.chassis?.model`,
    90000, `the console and ${ENGINE} (DEV build only)`);
  return page;
}

/** `--name value` pairs from the command line, over defaults. */
export function args(defaults) {
  const out = { ...defaults }, argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  const [w, h, s] = String(out.size ?? '2560x1300@2').split(/[x@]/).map(Number);
  return { ...out, width: w, height: h, scale: s || 2 };
}
