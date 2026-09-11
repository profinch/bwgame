/**
 * Other people, and word of what they have done.
 *
 * The live server (live/) passes the present moment around: who is standing
 * where, and which plots the subgraph has just learned of. This is the world's
 * end of it — one socket, reconnected when it drops, positions sent when they
 * change and never more than ten times a second, and the people heard about
 * eased toward where they were last said to be, so ten reports a second read
 * as walking rather than as jumping.
 *
 * Positions cross the wire in metres from the corner of the world, not from
 * home: two people with different homes have to agree on where a third one is.
 * The world works exactly the same with no server at all.
 */

export interface Peer {
  id: number;
  /** Where they were last said to be, in metres from the corner of the world. */
  x: number;
  z: number;
  yaw: number;
  dig: boolean;
  /** Where they are drawn, on the way to where they were said to be. */
  drawnX: number;
  drawnZ: number;
  drawnYaw: number;
}

/** The peers in a `peers` message, or null if it is not one. */
export function peersIn(message: unknown): Omit<Peer, 'drawnX' | 'drawnZ' | 'drawnYaw'>[] | null {
  const said = message as { t?: string; peers?: unknown };
  if (said?.t !== 'peers' || !Array.isArray(said.peers)) return null;
  const out: Omit<Peer, 'drawnX' | 'drawnZ' | 'drawnYaw'>[] = [];
  for (const row of said.peers as { id?: number; x?: number; z?: number; yaw?: number; dig?: boolean }[]) {
    if (typeof row.id !== 'number' || typeof row.x !== 'number' || typeof row.z !== 'number') continue;
    out.push({ id: row.id, x: row.x, z: row.z, yaw: typeof row.yaw === 'number' ? row.yaw : 0, dig: Boolean(row.dig) });
  }
  return out;
}

/** How often at most a position is sent, and how long at most between two — a
 * person standing still is still here, and the server counts silence as gone. */
const SAYS_EVERY = 100;
const SAYS_AT_LEAST_EVERY = 5000;
/** How much of the way to where a peer was said to be is covered each second. */
const EASES_AT = 12;

export class Live {
  readonly peers = new Map<number, Peer>();
  /** Who I am in the room, once the server has said. */
  me = 0;
  private socket: WebSocket | null = null;
  private lastSaid = 0;
  private lastSaidWhat = '';
  private retryIn = 1000;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly room: string,
    /** Told when the server says plots have changed. */
    private readonly onChanged: () => void,
  ) {
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.later();
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.retryIn = 1000;
      socket.send(JSON.stringify({ t: 'hi', room: this.room }));
      this.lastSaidWhat = '';
    });
    socket.addEventListener('message', (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const peers = peersIn(message);
      if (peers) {
        const seen = new Set<number>();
        for (const said of peers) {
          seen.add(said.id);
          const had = this.peers.get(said.id);
          if (had) {
            had.x = said.x;
            had.z = said.z;
            had.yaw = said.yaw;
            had.dig = said.dig;
          } else {
            this.peers.set(said.id, { ...said, drawnX: said.x, drawnZ: said.z, drawnYaw: said.yaw });
          }
        }
        for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id);
        return;
      }
      const said = message as { t?: string; id?: number };
      if (said?.t === 'you' && typeof said.id === 'number') this.me = said.id;
      if (said?.t === 'changed') this.onChanged();
    });
    const drop = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.peers.clear();
      this.later();
    };
    socket.addEventListener('close', drop);
    socket.addEventListener('error', drop);
  }

  /** Try again after a while, and a longer while each time, up to half a minute. */
  private later(): void {
    if (this.closed) return;
    setTimeout(() => this.connect(), this.retryIn);
    this.retryIn = Math.min(30_000, this.retryIn * 2);
  }

  /** Where you are, if it has changed and it has been a moment since the last time. */
  say(x: number, z: number, yaw: number, dig: boolean): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastSaid < SAYS_EVERY) return;
    const what = `${x.toFixed(2)}:${z.toFixed(2)}:${yaw.toFixed(2)}:${dig ? 1 : 0}`;
    if (what === this.lastSaidWhat && now - this.lastSaid < SAYS_AT_LEAST_EVERY) return;
    this.lastSaid = now;
    this.lastSaidWhat = what;
    socket.send(JSON.stringify({ t: 'at', x, z, yaw, dig }));
  }

  /** Carry everybody a little further toward where they were last said to be. */
  step(seconds: number): void {
    const share = 1 - Math.exp(-EASES_AT * seconds);
    for (const peer of this.peers.values()) {
      peer.drawnX += (peer.x - peer.drawnX) * share;
      peer.drawnZ += (peer.z - peer.drawnZ) * share;
      let turn = peer.yaw - peer.drawnYaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      peer.drawnYaw += turn * share;
    }
  }

  /**
   * Leave the room, saying so: a closing socket may take the edge in front of
   * the server half a minute to notice, and until it did you stood there still
   * — and came back to yourself as somebody else.
   */
  close(): void {
    this.closed = true;
    const socket = this.socket;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'bye' }));
    socket?.close();
  }
}
