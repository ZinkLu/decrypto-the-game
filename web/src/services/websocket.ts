type MessageHandler = (type: string, data: unknown) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handler: MessageHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private intentionalDisconnect = false;

  constructor(url: string, handler: MessageHandler) {
    this.url = url;
    this.handler = handler;
  }

  connect() {
    this.intentionalDisconnect = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.handler('_connected', {});
    };

    this.ws.onclose = () => {
      this.handler('_disconnected', {});
      // Only auto-reconnect if the close was NOT intentional
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; data: unknown };
        this.handler(msg.type, msg.data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }

  send(type: string, data: unknown = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn(`WebSocket not connected. Dropping message: ${type}`);
    }
  }

  disconnect() {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.connect();
    }, this.reconnectDelay);
  }
}
