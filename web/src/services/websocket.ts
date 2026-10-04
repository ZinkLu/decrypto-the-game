type MessageHandler = (type: string, data: unknown, serverTime?: number) => void;

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
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectDelay = 1000;
      this.handler("_connected", {});
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (!this.intentionalDisconnect) this.handler("_disconnected", {});
      // Only auto-reconnect if the close was NOT intentional
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (event: MessageEvent) => {
      if (this.ws !== socket) return;
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          data: unknown;
          server_time?: number;
        };
        this.handler(msg.type, msg.data, msg.server_time);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
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
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.connect();
    }, this.reconnectDelay);
  }
}
