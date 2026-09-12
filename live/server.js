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
/**
 * The chain itself, read off Blockscout, for when the subgraph will not
 * answer: the factories' claims, each plot's own events, the names. The same
 * rows come out as the subgraph gives, so nobody downstream can tell.
 */
const BLOCKSCOUT = process.env.BLOCKSCOUT ?? 'https://eth-sepolia.blockscout.com';
const FACTORIES = (
  process.env.FACTORIES ??
  '0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088,0x4bbfaE0A0BEe0F49F3ecbCCcC638a0235359eb73,0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df'
)
  .split(',')
  .map((it) => it.trim())
  .filter(Boolean);
const NAMES = process.env.NAMES ?? '0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED';
const TOPIC = {
  claimed: '0xc32f9ef6676124cd4f64af9a81204b2f81c2dcd73e9f170cd114df97eb7c8fe4',
  inscribed: '0x680e8292592f2ba33b810e666857c949c7968c50957e7b4b4b2b7f7935564808',
  transferred: '0xa1c3c7ba08cdab9542dfbb1f9606093e828bca6c2678c82942703ec4e2237902',
  codeSet: '0xcd97b75ea1b5217143c4471556bcf3ff3d9ee05eba2913028a1b3d74374142bf',
  sealed: '0x2aa218dc3f649885182934318cf0f5c4966c70a67fad288bab6859b77bf8d094',
  named: '0x418b43aaaf6e778e64a1e00a6dcf49679517d0a2ed54df922ec5e6ad3f21da4c',
  unnamed: '0x716fe3c2abaeeab2657968647db646cc99fb457a562b9bb4c6162c34bbe2bbb2',
};
/** How long the subgraph has to be silent before the chain is read instead, and how often then. */
const CHAIN_AFTER = 120_000;
const CHAIN_EVERY = 600_000;

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
/** When the subgraph last answered, and when the chain was last read instead. */
let graphAnsweredAt = Date.now();
let chainReadAt = 0;
let readingChain = false;

/** The tail of a topic as an address. */
const addressIn = (topic) => `0x${String(topic).slice(-40)}`.toLowerCase();

/** An ABI-encoded string, the one argument in a log's data. */
function stringIn(data) {
  const hex = String(data).replace(/^0x/, '');
  const offset = parseInt(hex.slice(0, 64), 16) * 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
  return Buffer.from(hex.slice(offset + 64, offset + 64 + length), 'hex').toString('utf8');
}

/** Every log of an address off Blockscout, oldest first. */
async function logsOf(address) {
  const out = [];
  let next = null;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${BLOCKSCOUT}/api/v2/addresses/${address}/logs`);
    if (next) for (const [k, v] of Object.entries(next)) url.searchParams.set(k, String(v));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`blockscout ${response.status} for ${address}`);
    const answer = await response.json();
    for (const it of answer.items ?? []) out.push(it);
    next = answer.next_page_params;
    if (!next) break;
  }
  return out.sort((a, b) => a.block_number - b.block_number || (a.index ?? 0) - (b.index ?? 0));
}

/**
 * The world as the chain says it, read the long way round, when the subgraph
 * has been silent: the factories' claims, then each plot's own events, then
 * the names. Rows come out shaped as the subgraph shapes them.
 */
async function readTheChain() {
  if (readingChain) return;
  readingChain = true;
  try {
    const rows = new Map();
    let top = 0;
    for (const factory of FACTORIES) {
      for (const log of await logsOf(factory)) {
        if (log.topics?.[0] !== TOPIC.claimed) continue;
        const id = addressIn(log.topics[1]);
        rows.set(id, {
          id,
          owner: { id: addressIn(log.topics[2]) },
          note: '',
          updatedIn: String(log.block_number),
          implementation: null,
          salt: `0x${String(log.data).replace(/^0x/, '').slice(0, 64)}`,
          name: null,
          inscriptions: [],
        });
        top = Math.max(top, log.block_number);
      }
    }
    for (const row of rows.values()) {
      for (const log of await logsOf(row.id)) {
        const topic = log.topics?.[0];
        if (topic === TOPIC.inscribed) {
          row.note = stringIn(log.data);
          row.inscriptions.push({ note: row.note });
        }
        else if (topic === TOPIC.transferred) row.owner = { id: addressIn(log.topics[2]) };
        else if (topic === TOPIC.codeSet) {
          const code = addressIn(log.topics[1]);
          row.implementation = /^0x0{40}$/.test(code) ? null : code;
        } else continue;
        row.updatedIn = String(Math.max(Number(row.updatedIn), log.block_number));
        top = Math.max(top, log.block_number);
      }
    }
    for (const log of await logsOf(NAMES)) {
      const topic = log.topics?.[0];
      if (topic !== TOPIC.named && topic !== TOPIC.unnamed) continue;
      const row = rows.get(addressIn(log.topics[1]));
      if (!row) continue;
      row.name = topic === TOPIC.named ? stringIn(log.data) : null;
      row.updatedIn = String(Math.max(Number(row.updatedIn), log.block_number));
      top = Math.max(top, log.block_number);
    }
    for (const [id, row] of rows) if (!plots.has(id) || Number(plots.get(id).updatedIn) <= Number(row.updatedIn)) plots.set(id, row);
    graphBlock = Math.max(graphBlock, top);
    chainReadAt = Date.now();
    console.log(`${new Date().toISOString()} read the chain instead: ${rows.size} plot(s) as of block ${top}`);
  } catch (error) {
    console.error('the chain could not be read:', error?.message ?? error);
  } finally {
    readingChain = false;
  }
}

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
          `{ id owner { id } note updatedIn implementation salt name inscriptions(orderBy: at, orderDirection: asc) { note } } }`,
      }),
    });
    if (!response.ok) {
      // refused: ask less often, up to ten minutes apart, until it answers again
      asksIn = Math.min(ASKS_AT_MOST_EVERY, asksIn * 2);
      console.error(`${new Date().toISOString()} the subgraph refused (${response.status}); asking again in ${asksIn / 1000}s`);
      // silent long enough: the chain is read the long way round instead
      if (Date.now() - graphAnsweredAt > CHAIN_AFTER && Date.now() - chainReadAt > CHAIN_EVERY) void readTheChain();
      return;
    }
    asksIn = ASKS_EVERY;
    graphAnsweredAt = Date.now();
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
// nothing known at the start and the subgraph not answering: the chain, at once
setTimeout(() => {
  if (plots.size === 0) void readTheChain();
}, 5000);

http.listen(PORT, () => console.log(`live on :${PORT}, watching ${SUBGRAPH || 'nothing'} for ${ROOM}`));
