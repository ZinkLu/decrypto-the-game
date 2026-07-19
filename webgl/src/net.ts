// WebSocket transport with automatic reconnect.
//
// Identity is bound to the connection server-side (HANDOFF §5.1): a reconnect
// is a brand-new player and cannot rejoin a started game. We still reconnect
// in the background so the home screen becomes usable again; the store decides
// how to degrade.

export type MessageHandler = (type: string, data: unknown) => void;

export class Net {
  private ws: WebSocket | null = null;
  private reconnectDelay = 800;
  private reconnectTimer: number | null = null;
  private closedByUser = false;

  constructor(private readonly onMessage: MessageHandler) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closedByUser = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 800;
      this.onMessage('_connected', {});
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data: unknown };
        this.onMessage(msg.type, msg.data);
      } catch (err) {
        console.error('bad server message', err);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.onMessage('_disconnected', {});
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows and handles the state transition.
    };
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(type: string, data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, data }));
    return true;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 8000);
      this.connect();
    }, this.reconnectDelay);
  }
}
