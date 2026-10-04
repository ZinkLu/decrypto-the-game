#!/bin/sh
# Starts the headless Chrome the probes drive. It renders on the real GPU (ANGLE on Metal).
# Port: CDP_PORT, default 9555. Restart it after the display has slept: rAF stalls and the
# log shows "CVDisplayLinkCreateWithCGDisplay failed".
PORT=${CDP_PORT:-9555}
pkill -f "remote-debugging-port=$PORT"; sleep 1; rm -rf /tmp/console-perf-chrome
("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port="$PORT" \
  --user-data-dir=/tmp/console-perf-chrome --window-size=1440,900 --no-first-run --autoplay-policy=no-user-gesture-required \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
  about:blank > /tmp/console-perf-chrome.log 2>&1 &)
for i in $(seq 1 20); do curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null && exit 0; sleep .5; done
echo "Chrome did not start on port $PORT" >&2; exit 1
