import { getActiveTenantId } from '../auth';

export type NinjaPoolSocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface Options {
  roomId: string;
  onMessage: (message: Record<string, any>) => void;
  onState: (state: NinjaPoolSocketState) => void;
}

export class NinjaPoolRoomSocket {
  private socket: WebSocket | null = null;
  private retryTimer: number | null = null;
  private attempt = 0;
  private stopped = false;

  constructor(private readonly options: Options) {}

  connect(): void {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.options.onState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tenantId = getActiveTenantId();
    const tenantPath = tenantId
      ? `/v1/tenants/${encodeURIComponent(tenantId)}/modules/ninja-pool-hall`
      : '/v1/modules/ninja-pool-hall';
    const url = `${protocol}//${window.location.host}/ws${tenantPath}/rooms/${encodeURIComponent(this.options.roomId)}/socket`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.options.onState('open');
      this.send({ type: 'stateRequest' });
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message && typeof message === 'object') this.options.onMessage(message);
      } catch {
        this.options.onMessage({ type: 'error', code: 'NINJA_POOL_INVALID_SERVER_MESSAGE', error: 'The room sent an invalid message' });
      }
    });
    socket.addEventListener('close', (event) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped || event.code === 1000 || [4404, 4409].includes(event.code)) {
        this.options.onState('closed');
        return;
      }
      this.attempt += 1;
      this.options.onState('reconnecting');
      const delay = Math.min(8_000, 400 * (2 ** Math.min(this.attempt, 5)));
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => socket.close());
  }

  send(message: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(sendLeave = false): void {
    this.stopped = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (sendLeave) this.send({ type: 'leave' });
    this.socket?.close(1000, 'Client closed');
    this.socket = null;
    this.options.onState('closed');
  }
}
