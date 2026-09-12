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
  /** Whether they stand here as a person: a selfie check with World, verified by the server. */
  human: boolean;
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
  for (const row of said.peers as { id?: number; x?: number; z?: number; yaw?: number; dig?: boolean; human?: boolean }[]) {
    if (typeof row.id !== 'number' || typeof row.x !== 'number' || typeof row.z !== 'number') continue;
    out.push({ id: row.id, x: row.x, z: row.z, yaw: typeof row.yaw === 'number' ? row.yaw : 0, dig: Boolean(row.dig), human: row.human === true });
  }
  return out;
}

/** How often at most a position is sent, and how long at most between two — a
 * person standing still is still here, and the server counts silence as gone. */
const SAYS_EVERY = 100;
const SAYS_AT_LEAST_EVERY = 5000;
/** How much of the way to where a peer was said to be is covered each second. */
const EASES_AT = 12;

/** The world as the server has said it, kept up by what it says next. */
export interface World {
  /** Counts up with every word from the server, so a reader knows whether anything is new. */
  version: number;
  block: number;
  /** Rows as the index shapes them, by address. */
  plots: Map<string, unknown>;
  revealed: Set<string>;
}

export class Live {
  readonly peers = new Map<number, Peer>();
  /** Null until the server has said the world once this connection. */
  world: World | null = null;
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

  /** Out of the room for a while — the onboarding — neither seen nor seeing. */
  private paused = false;

  private connect(): void {
    if (this.closed || this.paused) return;
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
      // and who this is, if a selfie check has said so: the room is joined as a stranger otherwise
      if (this.token) socket.send(JSON.stringify({ t: 'human', token: this.token }));
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
            had.human = said.human;
          } else {
            this.peers.set(said.id, { ...said, drawnX: said.x, drawnZ: said.z, drawnYaw: said.yaw });
          }
        }
        for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id);
        return;
      }
      const said = message as { t?: string; id?: number; human?: boolean; block?: number; plots?: unknown; revealed?: unknown; addresses?: unknown };
      if (said?.t === 'you' && typeof said.id === 'number') {
        this.me = said.id;
        this.human = Boolean(said.human);
      }
      if (said?.t === 'world') {
        const world: World = { version: (this.world?.version ?? 0) + 1, block: Number(said.block ?? 0) || 0, plots: new Map(), revealed: new Set() };
        if (Array.isArray(said.plots)) for (const row of said.plots as { id?: unknown }[]) if (typeof row?.id === 'string') world.plots.set(row.id.toLowerCase(), row);
        if (Array.isArray(said.revealed)) for (const it of said.revealed) if (typeof it === 'string') world.revealed.add(it.toLowerCase());
        this.world = world;
        this.onChanged();
      }
      if (said?.t === 'changed' && this.world && Array.isArray(said.plots)) {
        for (const row of said.plots as { id?: unknown }[]) if (typeof row?.id === 'string') this.world.plots.set(row.id.toLowerCase(), row);
        this.world.block = Math.max(this.world.block, Number(said.block ?? 0) || 0);
        this.world.version++;
        this.onChanged();
      }
      if (said?.t === 'revealed' && this.world && Array.isArray(said.addresses)) {
        for (const it of said.addresses) if (typeof it === 'string') this.world.revealed.add(it.toLowerCase());
        this.world.version++;
        this.onChanged();
      }
    });
    const drop = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.peers.clear();
      this.world = null;
      this.later();
    };
    socket.addEventListener('close', drop);
    socket.addEventListener('error', drop);
  }

  /** Try again after a while, and a longer while each time, up to half a minute. */
  private later(): void {
    if (this.closed || this.paused) return;
    setTimeout(() => this.connect(), this.retryIn);
    this.retryIn = Math.min(30_000, this.retryIn * 2);
  }

  /** Whether the server counts this connection as a person, having seen a token it issued. */
  human = false;
  private token: string | null = null;

  /**
   * The token a verified selfie check earned, or none: shown to the server on
   * every connection from now on, so this one stands in the room as a person
   * — whose word about a place is kept for everybody at once.
   */
  asPerson(token: string | null): void {
    this.token = token;
    const socket = this.socket;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'human', token: token ?? '' }));
    else if (!token) this.human = false;
  }

  /** You went to an address and found something standing: the place is remembered for everybody. */
  saw(address: string): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: 'saw', address }));
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
   * Step out of the room, saying so, and come back later: while the onboarding
   * plays, nobody sees the walker it drives, and the tour sees nobody but the
   * player it brings — the game and the onboarding kept apart.
   */
  pause(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    if (on) {
      const socket = this.socket;
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'bye' }));
      this.socket = null;
      socket?.close();
      this.peers.clear();
      this.world = null;
    } else {
      this.retryIn = 1000;
      this.connect();
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
