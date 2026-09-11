/**
 * The live server: the little that has to be shared while people are here.
 *
 * Two things, and nothing kept. Who is standing where, so that other people are
 * seen — a room a chain, a position a person, told to everybody else in the
 * room ten times a second. And word of a claim: the server asks the subgraph
 * what changed every few seconds, once for everybody, and tells the room, so a
 * plot goes up on every screen within seconds of its block rather than
 * whenever each client next asks for itself.
 *
 * Nothing is stored. The chain is the record and the subgraph is the index;
 * this only passes the present moment around. The world works without it.
 *
 *   PORT       where to listen (8790)
 *   SUBGRAPH   the subgraph to watch for changes; none, and no claims are told
 *   ROOM       the room the subgraph's claims belong to (sepolia)
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8790);
const SUBGRAPH = process.env.SUBGRAPH ?? '';
const ROOM = process.env.ROOM ?? 'sepolia';

/** How often the rooms are told where everybody is, and how often the subgraph is asked. */
const TELLS_EVERY = 100;
/**
 * The subgraph is asked from here and nowhere else: Subgraph Studio throttles
 * a subgraph as a whole (429 to everyone, 12.09.2026), so one asker every
 * half minute, backing off when refused, and every page reads the answer from
 * this server's feed instead.
 */
const ASKS_EVERY = 30_000;
const ASKS_AT_MOST_EVERY = 600_000;
/** A person who has said nothing for this long has gone. Clients speak at least every five seconds. */
const GONE_AFTER = 12_000;
/** How often a socket is pinged, so the edge in front of us does not close it as idle. */
const PINGS_EVERY = 25_000;

let nextId = 1;
/** room -> id -> person */
const rooms = new Map();

function room(name) {
  let found = rooms.get(name);
  if (!found) {
    found = new Map();
    rooms.set(name, found);
  }
  return found;
}

function tell(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

const http = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://x');
  // the feed: every plot the subgraph has said, or those changed since a block
  if (url.pathname.endsWith('/plots')) {
    const since = Number(url.searchParams.get('since') ?? 0) || 0;
    const rows = [...plots.values()].filter((p) => Number(p.updatedIn) > since);
    response.writeHead(graphBlock ? 200 : 503, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    response.end(JSON.stringify({ block: graphBlock, plots: rows }));
    return;
  }
  // a plain request gets a plain answer, so a health check has something to read
  response.writeHead(200, { 'content-type': 'application/json' });
  const counts = {};
  for (const [name, people] of rooms) counts[name] = people.size;
  response.end(JSON.stringify({ rooms: counts, plots: plots.size, block: graphBlock }));
});

const sockets = new WebSocketServer({ server: http, maxPayload: 4096 });

sockets.on('connection', (socket) => {
  const id = nextId++;
  let inRoom = null;
  let person = null;

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.t === 'hi' && typeof message.room === 'string' && /^[a-z0-9-]{1,32}$/.test(message.room)) {
      if (inRoom) room(inRoom).delete(id);
      inRoom = message.room;
      person = { id, x: 0, z: 0, yaw: 0, dig: false, seen: Date.now(), socket };
      room(inRoom).set(id, person);
      tell(socket, { t: 'you', id });
      return;
    }
    // leaving, said out loud: gone at once, however long the edge in front of
    // us takes to notice the socket has closed
    if (message.t === 'bye') {
      if (inRoom) room(inRoom).delete(id);
      inRoom = null;
      person = null;
      socket.close();
      return;
    }
    if (message.t === 'at' && person && inRoom) {
      const { x, z, yaw, dig } = message;
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return;
      person.x = x;
      person.z = z;
      person.yaw = yaw;
      person.dig = Boolean(dig);
      person.seen = Date.now();
      // somebody who was quiet long enough to be counted gone, and speaks again
      room(inRoom).set(id, person);
    }
  });

  socket.on('close', () => {
    if (inRoom) room(inRoom).delete(id);
  });
});

// where everybody is, to everybody else, ten times a second
setInterval(() => {
  const now = Date.now();
  for (const people of rooms.values()) {
    for (const [id, person] of people) {
      if (now - person.seen > GONE_AFTER) {
        people.delete(id);
        person.socket.close();
      }
    }
    // everybody is told what changed for them — including that the room has
    // emptied: left untold, the one who stayed would keep seeing the one who
    // left, standing where they last stood
    const everyone = [...people.values()].map((p) => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, dig: p.dig }));
    for (const person of people.values()) {
      const word = JSON.stringify({ t: 'peers', peers: everyone.filter((p) => p.id !== person.id) });
      if (word === person.told) continue;
      person.told = word;
      if (person.socket.readyState === 1) person.socket.send(word);
    }
  }
}, TELLS_EVERY);

// keep the sockets warm: a proxy at the edge closes a quiet one
setInterval(() => {
  for (const socket of sockets.clients) {
    if (socket.readyState === socket.OPEN) socket.ping();
  }
}, PINGS_EVERY);

// what has changed, from the subgraph, once for everybody
let graphSeen = 0;
/** The block the subgraph's last answer was current at: what the feed says it is as of. */
let graphBlock = 0;
/** Every plot the subgraph has said, by address, as the subgraph shapes a row. */
const plots = new Map();
/** How long until the next ask: the usual, or longer after a refusal. */
let asksIn = ASKS_EVERY;

async function askTheGraph() {
  if (!SUBGRAPH) return;
  try {
    const response = await fetch(SUBGRAPH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          `{ _meta { block { number } } ` +
          `plots(first: 1000, orderBy: updatedIn, where: { updatedIn_gt: ${graphSeen} }) ` +
          `{ id owner { id } note updatedIn implementation salt name } }`,
      }),
    });
    if (!response.ok) {
      // refused: ask less often, up to ten minutes apart, until it answers again
      asksIn = Math.min(ASKS_AT_MOST_EVERY, asksIn * 2);
      console.error(`${new Date().toISOString()} the subgraph refused (${response.status}); asking again in ${asksIn / 1000}s`);
      return;
    }
    asksIn = ASKS_EVERY;
    const answer = await response.json();
    const rows = answer?.data?.plots;
    const block = answer?.data?._meta?.block?.number ?? 0;
    if (!Array.isArray(rows)) return;
    for (const row of rows) if (typeof row?.id === 'string') plots.set(row.id.toLowerCase(), row);
    const first = graphSeen === 0;
    graphSeen = Math.max(graphSeen, block);
    graphBlock = Math.max(graphBlock, block);
    // the first answer is the whole world as it stands; nobody needs telling
    if (first || rows.length === 0) return;
    const changed = rows.map((p) => ({ plot: p.id, owner: p.owner?.id, note: p.note, updatedIn: Number(p.updatedIn) }));
    for (const person of room(ROOM).values()) tell(person.socket, { t: 'changed', plots: changed });
    console.log(`${new Date().toISOString()} told ${room(ROOM).size} about ${changed.length} changed plot(s)`);
  } catch (error) {
    console.error('the subgraph did not answer:', error?.message ?? error);
  } finally {
    setTimeout(askTheGraph, asksIn);
  }
}
void askTheGraph();

http.listen(PORT, () => console.log(`live on :${PORT}, watching ${SUBGRAPH || 'nothing'} for ${ROOM}`));
