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
const ASKS_EVERY = 4000;
/** A person who has said nothing for this long has gone. Clients speak at least every few seconds. */
const GONE_AFTER = 30_000;
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
  // a plain request gets a plain answer, so a health check has something to read
  response.writeHead(200, { 'content-type': 'application/json' });
  const counts = {};
  for (const [name, people] of rooms) counts[name] = people.size;
  response.end(JSON.stringify({ rooms: counts }));
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
    if (people.size < 2) continue;
    const everyone = [...people.values()].map((p) => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, dig: p.dig }));
    for (const person of people.values()) {
      tell(person.socket, { t: 'peers', peers: everyone.filter((p) => p.id !== person.id) });
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
          `{ id owner { id } note updatedIn } }`,
      }),
    });
    if (!response.ok) return;
    const answer = await response.json();
    const plots = answer?.data?.plots;
    const block = answer?.data?._meta?.block?.number ?? 0;
    if (!Array.isArray(plots)) return;
    const first = graphSeen === 0;
    graphSeen = Math.max(graphSeen, block);
    // the first answer is the whole world as it stands; nobody needs telling
    if (first || plots.length === 0) return;
    const changed = plots.map((p) => ({ plot: p.id, owner: p.owner?.id, note: p.note, updatedIn: Number(p.updatedIn) }));
    for (const person of room(ROOM).values()) tell(person.socket, { t: 'changed', plots: changed });
    console.log(`${new Date().toISOString()} told ${room(ROOM).size} about ${changed.length} changed plot(s)`);
  } catch (error) {
    console.error('the subgraph did not answer:', error?.message ?? error);
  }
}
setInterval(askTheGraph, ASKS_EVERY);
void askTheGraph();

http.listen(PORT, () => console.log(`live on :${PORT}, watching ${SUBGRAPH || 'nothing'} for ${ROOM}`));
