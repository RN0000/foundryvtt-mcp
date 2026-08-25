/**
 * WebSocket client that dials into the foundryvtt-mcp server's module bridge.
 *
 * Ported from alexivenkov/foundry-api-bridge-module (MIT), WebSocketClient.ts,
 * adapted to plain browser JS and this module's `{id,type,params}` /
 * `{id,result}` / `{id,error}` wire shape (server: src/foundry/module-bridge.ts).
 */

const WS_OPEN = 1;
const DEFAULT_RECONNECT_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class BridgeTransport {
  /**
   * @param {string} url
   * @param {(type: string, params: Record<string, unknown>) => Promise<unknown>} onCommand
   */
  constructor(url, onCommand) {
    this.url = url;
    this.onCommand = onCommand;
    /** @type {WebSocket | null} */
    this.socket = null;
    this.reconnectAttempts = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.reconnectTimer = null;
    this.manualClose = false;
  }

  connect() {
    if (this.socket?.readyState === WS_OPEN) return;
    this.manualClose = false;
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      console.log(`FoundryVTT MCP Bridge | connected to ${this.url}`);
    };
    socket.onclose = () => {
      console.log('FoundryVTT MCP Bridge | disconnected');
      if (!this.manualClose) this.scheduleReconnect();
    };
    socket.onerror = (event) => {
      console.error('FoundryVTT MCP Bridge | socket error', event);
    };
    socket.onmessage = (event) => this.handleMessage(event);
  }

  disconnect() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  /** @param {MessageEvent} event */
  async handleMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.error('FoundryVTT MCP Bridge | received non-JSON message');
      return;
    }
    if (!msg || typeof msg.id !== 'string' || typeof msg.type !== 'string') {
      console.error('FoundryVTT MCP Bridge | received malformed command', msg);
      return;
    }
    try {
      const result = await this.onCommand(msg.type, msg.params ?? {});
      this.send({ id: msg.id, result });
    } catch (error) {
      this.send({ id: msg.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** @param {{id: string, result?: unknown, error?: string}} response */
  send(response) {
    if (this.socket?.readyState !== WS_OPEN) {
      console.warn('FoundryVTT MCP Bridge | cannot respond, socket not open');
      return;
    }
    this.socket.send(JSON.stringify(response));
  }

  /**
   * Pushes an unsolicited `{event, payload}` message — canvas activity
   * (targeting, pings) the bridge has no outstanding request for. Silently
   * no-ops while disconnected: a Foundry hook firing during a dropped
   * connection must never throw back into Foundry's own event dispatch.
   *
   * @param {string} event
   * @param {Record<string, unknown>} payload
   */
  sendEvent(event, payload) {
    if (this.socket?.readyState !== WS_OPEN) return;
    this.socket.send(JSON.stringify({ event, payload }));
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('FoundryVTT MCP Bridge | max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = DEFAULT_RECONNECT_INTERVAL_MS * 2 ** (this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
