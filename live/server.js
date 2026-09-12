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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { signRequest } from '@worldcoin/idkit-server';

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
/**
 * The shared memory of revealed places: every address anybody has gone to and
 * found something standing at — a wallet, a contract — so that a place seen
 * by one is seen by all. Not from the chain: nobody's visit is on it. Kept
 * on disk, so a restart forgets nothing.
 */
const REVEALED_FILE = process.env.REVEALED_FILE ?? '/data/revealed.json';
/** The most places kept, and the least time between one person's reports. */
const REVEALED_MOST = 20_000;
const SAWS_AT_MOST_EVERY = 1500;
/**
 * How much a stranger's word weighs against a person's, in the shared memory.
 *
 * Anybody can open fifty tabs and be fifty strangers, and fill the memory with
 * whatever they like — or with nothing but their own wallet, fifty times. A
 * person, checked by World (a selfie: one live person behind the screen), is
 * counted whole: what they found is kept for everybody at once. A stranger's
 * word is heard by the room, and kept only once this many strangers have said
 * the same. Not a wall — three tabs are three strangers — but the cost of
 * filling the memory becomes work rather than a loop, which is the point.
 */
const STRANGER_WORD = 1 / 3;

/**
 * World ID, Selfie Check: who here is a person.
 *
 * The check runs in the World App against a selfie; IDKit brings the proof
 * back to the page, and the page hands it here to be verified by World's
 * Developer Portal — with the RP signature this server put on the request,
 * because a request has to be signed by the relying party and the key never
 * leaves it. A proof that verifies becomes a token, good for as long as the
 * credential is (ninety days), which the page shows on each connection to
 * stand in the room as a person. Nothing about the person is kept: a hash of
 * the token and a date.
 *
 * Without the keys in the environment the pages are told so, and everybody
 * is a stranger — the world works as it did.
 */
const WORLD = {
  appId: process.env.WORLD_APP_ID ?? '',
  rpId: process.env.WORLD_RP_ID ?? '',
  signingKey: process.env.WORLD_RP_SIGNING_KEY ?? '',
  action: process.env.WORLD_ACTION ?? 'stand-as-a-person',
  environment: process.env.WORLD_ENV ?? 'production',
  verifyUrl: process.env.WORLD_VERIFY_URL ?? 'https://developer.world.org/api/v4/verify',
};
const worldSet = Boolean(WORLD.appId && WORLD.rpId && WORLD.signingKey);
const HUMANS_FILE = process.env.HUMANS_FILE ?? '/data/humans.json';
/** How long a token stands for: the credential's own ninety days. */
const HUMAN_FOR = 90 * 24 * 3600 * 1000;
/**
 * The Graph's Token API (run by Pinax): what a wallet holds, every token, on
 * the networks it covers — mainnet among them, Sepolia not. Asked from here
 * with the team's key, which does not go to the browser; answers kept a
 * minute, a token's supply kept for good. Without a key the pages fall back
 * to Blockscout, as they did.
 */
const TOKEN_API = process.env.TOKEN_API ?? 'https://api.pinax.network';
const TOKEN_API_KEY = process.env.TOKEN_API_JWT ?? process.env.TOKEN_API_KEY ?? '';
const HOLDINGS_KEPT_FOR = 300_000;
/** How many supplies are asked for at once. */
const SUPPLIES_AT_ONCE = 4;
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

/**
 * address -> { at: when first seen, count: how many times, weight: how much
 * word there is for it, kept: whether it is remembered for everybody }. A row
 * kept before weights were counted is kept: it was a person's word then.
 */
const revealed = new Map();
try {
  if (existsSync(REVEALED_FILE)) {
    for (const [address, it] of Object.entries(JSON.parse(readFileSync(REVEALED_FILE, 'utf8')))) {
      revealed.set(address, { ...it, weight: it.weight ?? 1, kept: it.kept ?? true });
    }
    console.log(`${revealed.size} revealed place(s) remembered from ${REVEALED_FILE}`);
  }
} catch (error) {
  console.error('the revealed places could not be read:', error?.message ?? error);
}
/** address@network -> { at, holdings } */
const holdingsKept = new Map();
/** contract@network -> a promise of the total supply as a string, or '' when the API had none */
const supplyKept = new Map();

async function tokenApi(path, params) {
  const url = new URL(`${TOKEN_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let tries = 0; ; tries++) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${TOKEN_API_KEY}`, accept: 'application/json' } });
    if (response.ok) {
      const answer = await response.json();
      return Array.isArray(answer?.data) ? answer.data : [];
    }
    // asked too fast: once more, after a breath
    if (response.status !== 429 || tries >= 2) throw new Error(`token api ${response.status} for ${path}`);
    await new Promise((r) => setTimeout(r, 700 * (tries + 1)));
  }
}

/** A few at a time: `go(work)` runs work when a place is free. */
function fewAtOnce(places) {
  let busy = 0;
  const queue = [];
  const next = () => {
    if (busy >= places || !queue.length) return;
    busy++;
    const { work, resolve, reject } = queue.shift();
    work().then(resolve, reject).finally(() => {
      busy--;
      next();
    });
  };
  return (work) =>
    new Promise((resolve, reject) => {
      queue.push({ work, resolve, reject });
      next();
    });
}
const askSupply = fewAtOnce(SUPPLIES_AT_ONCE);

/**
 * A token's total supply in raw units, kept for good. The API gives supplies
 * in token units, decimal-scaled; a post is sized by the share of the whole,
 * so the whole is put back in raw units. '' when the API does not know.
 */
function supplyOf(network, row) {
  const key = `${String(row.contract).toLowerCase()}@${network}`;
  let kept = supplyKept.get(key);
  if (!kept) {
    kept = askSupply(async () => {
      const [token] = await tokenApi('/v1/evm/tokens', { network, contract: row.contract });
      const supply = token?.total_supply ?? token?.circulating_supply;
      const decimals = Number(token?.decimals ?? row.decimals ?? 18);
      return supply === undefined || supply === null || !Number.isFinite(Number(supply))
        ? ''
        : (BigInt(Math.round(Number(supply))) * 10n ** BigInt(decimals)).toString();
    }).catch(() => '');
    supplyKept.set(key, kept);
  }
  return kept;
}

/**
 * Every fungible token a wallet holds on a network, with each token's total
 * supply, so a holding can be read as a share of it — told one at a time, so
 * a page can stand each post up as it is heard rather than wait for the last.
 * First a line saying how many are coming; then the tokens in the order the
 * API lists them, each as soon as its supply is in. Nothing when there is no
 * key to ask with or the network is not one the API covers.
 */
async function* holdingsRead(network, address) {
  if (!TOKEN_API_KEY || !/^[a-z0-9-]{1,32}$/.test(network) || !/^0x[0-9a-fA-F]{40}$/.test(address)) return;
  const key = `${address.toLowerCase()}@${network}`;
  const kept = holdingsKept.get(key);
  if (kept && Date.now() - kept.at < HOLDINGS_KEPT_FOR) {
    yield { count: kept.holdings.length };
    yield* kept.holdings;
    return;
  }
  // ten a page on the free plan; a wallet with more is read a few pages deep,
  // the rest of the pages asked for at once when the first one is full
  const balances = (page) => tokenApi('/v1/evm/balances', { network, address, limit: 10, page });
  const rows = await balances(1);
  if (rows.length >= 10) {
    const pages = await Promise.all([2, 3, 4, 5].map(balances));
    for (const part of pages) {
      rows.push(...part);
      if (part.length < 10) break;
    }
  }
  const worth = [];
  for (const row of rows) {
    if (!row?.symbol || !row.contract || !row.amount) continue;
    let amount;
    try {
      amount = BigInt(String(row.amount));
    } catch {
      continue;
    }
    if (amount > 0n) worth.push({ row, amount });
  }
  yield { count: worth.length };
  // the supplies are asked a few at a time, and told in the API's order
  const supplies = worth.map(({ row }) => supplyOf(network, row));
  const holdings = [];
  for (let i = 0; i < worth.length; i++) {
    const { row, amount } = worth[i];
    const supply = await supplies[i];
    const holding = { symbol: String(row.symbol), amount: amount.toString(), decimals: Number(row.decimals ?? 18), supply: supply || undefined };
    holdings.push(holding);
    yield holding;
  }
  holdingsKept.set(key, { at: Date.now(), holdings });
}

/** The same, in one piece: null when there is nothing to ask with. */
async function holdingsOf(network, address) {
  if (!TOKEN_API_KEY) return null;
  const holdings = [];
  let asked = false;
  for await (const line of holdingsRead(network, address)) {
    asked = true;
    if (line.symbol) holdings.push(line);
  }
  return asked ? { source: 'the graph token api', network, address: address.toLowerCase(), holdings } : null;
}

/** The places remembered for everybody: a person's word, or enough strangers'. */
const keptPlaces = () => [...revealed.entries()].filter(([, it]) => it.kept).map(([address]) => address);

/** sha256(token) -> until (ms). Who is a person here, for as long as the credential is. */
const humans = new Map();
try {
  if (existsSync(HUMANS_FILE)) {
    const now = Date.now();
    for (const [hash, until] of Object.entries(JSON.parse(readFileSync(HUMANS_FILE, 'utf8')))) if (until > now) humans.set(hash, until);
    console.log(`${humans.size} person(s) remembered from ${HUMANS_FILE}`);
  }
} catch (error) {
  console.error('the people could not be read:', error?.message ?? error);
}
function saveHumans() {
  try {
    mkdirSync(dirname(HUMANS_FILE), { recursive: true });
    writeFileSync(HUMANS_FILE, JSON.stringify(Object.fromEntries(humans)));
  } catch (error) {
    console.error('the people could not be kept:', error?.message ?? error);
  }
}
const hashOf = (token) => createHash('sha256').update(String(token)).digest('hex');
/** Whether a token stands for a person still. */
function personWith(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const until = humans.get(hashOf(token));
  return typeof until === 'number' && until > Date.now();
}

/** A signed request for the page to hand IDKit: the RP context, fresh each time. */
function humanRequest() {
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: WORLD.signingKey, action: WORLD.action });
  return {
    app_id: WORLD.appId,
    rp_id: WORLD.rpId,
    action: WORLD.action,
    environment: WORLD.environment,
    rp_context: { rp_id: WORLD.rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
  };
}

/**
 * A proof from IDKit, verified by World; a token for the person if it holds.
 * The proof is passed on whole — the verifier knows its shape better than we
 * do — and only its verdict is read: success, for our action.
 */
async function verifyHuman(result) {
  if (!result || typeof result !== 'object') return { error: 'no proof' };
  const response = await fetch(`${WORLD.verifyUrl}/${WORLD.rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(result),
  });
  let answer = null;
  try {
    answer = await response.json();
  } catch {
    // an empty or broken answer is a refusal
  }
  if (!response.ok || !answer?.success) return { error: answer?.detail ?? answer?.code ?? `the verifier said ${response.status}` };
  if (answer.action && answer.action !== WORLD.action) return { error: 'a proof for another action' };
  const token = randomBytes(32).toString('hex');
  const until = Date.now() + HUMAN_FOR;
  humans.set(hashOf(token), until);
  saveHumans();
  return { token, until };
}

/** The body of a request, as JSON, up to a size; null if it is not that. */
function readJson(request, limit) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        resolve(null);
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
  });
}

let saveDue = null;
function saveRevealed() {
  if (saveDue) return;
  saveDue = setTimeout(() => {
    saveDue = null;
    try {
      mkdirSync(dirname(REVEALED_FILE), { recursive: true });
      const rows = {};
      for (const [address, it] of revealed) if (it.kept) rows[address] = { at: it.at, count: it.count, weight: it.weight, kept: true };
      writeFileSync(REVEALED_FILE, JSON.stringify(rows));
    } catch (error) {
      console.error('the revealed places could not be kept:', error?.message ?? error);
    }
  }, 2000);
}

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
  // what a wallet holds, from The Graph's Token API: in one piece, or as a
  // stream of lines with `stream=1`, a token a line as each is heard
  if (url.pathname.endsWith('/holdings')) {
    const network = url.searchParams.get('network') ?? '';
    const address = url.searchParams.get('address') ?? '';
    const open = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
    void (async () => {
      try {
        if (url.searchParams.get('stream') !== '1') {
          const answer = await holdingsOf(network, address);
          response.writeHead(answer ? 200 : 503, { ...open, 'content-type': 'application/json' });
          response.end(JSON.stringify(answer ?? { error: 'no token api here' }));
          return;
        }
        let begun = false;
        for await (const line of holdingsRead(network, address)) {
          if (!begun) {
            begun = true;
            response.writeHead(200, { ...open, 'content-type': 'application/x-ndjson' });
          }
          response.write(`${JSON.stringify(line)}\n`);
        }
        if (!begun) response.writeHead(503, { ...open, 'content-type': 'application/json' });
        response.end(begun ? undefined : JSON.stringify({ error: 'no token api here' }));
      } catch (error) {
        // a stream cut short says what it had; nothing said yet is a plain failure
        if (!response.headersSent) response.writeHead(502, { ...open, 'content-type': 'application/json' });
        response.end(response.headersSent ? undefined : JSON.stringify({ error: String(error?.message ?? error) }));
      }
    })();
    return;
  }
  // the revealed places, every one remembered for everybody
  if (url.pathname.endsWith('/revealed')) {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    response.end(JSON.stringify({ addresses: keptPlaces() }));
    return;
  }
  // World ID: a signed request to hand IDKit (GET), or a proof to verify (POST)
  if (url.pathname.endsWith('/human')) {
    const open = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...open, 'access-control-allow-methods': 'GET, POST, OPTIONS' });
      response.end();
      return;
    }
    if (!worldSet) {
      response.writeHead(503, open);
      response.end(JSON.stringify({ error: 'no world id here' }));
      return;
    }
    if (request.method === 'POST') {
      void readJson(request, 64_000).then(
        (body) => verifyHuman(body?.result).then((verdict) => {
          response.writeHead(verdict.token ? 200 : 403, open);
          response.end(JSON.stringify(verdict));
        }),
        (error) => {
          response.writeHead(502, open);
          response.end(JSON.stringify({ error: String(error?.message ?? error) }));
        },
      ).catch((error) => {
        response.writeHead(502, open);
        response.end(JSON.stringify({ error: String(error?.message ?? error) }));
      });
      return;
    }
    response.writeHead(200, open);
    response.end(JSON.stringify(humanRequest()));
    return;
  }
  // a plain request gets a plain answer, so a health check has something to read
  response.writeHead(200, { 'content-type': 'application/json' });
  const counts = {};
  for (const [name, people] of rooms) counts[name] = people.size;
  response.end(JSON.stringify({ rooms: counts, plots: plots.size, block: graphBlock, revealed: keptPlaces().length, heard: revealed.size, people: humans.size, worldId: worldSet }));
});

const sockets = new WebSocketServer({ server: http, maxPayload: 4096 });

sockets.on('connection', (socket) => {
  const id = nextId++;
  let inRoom = null;
  let person = null;
  /** Whether this connection has shown a token that stands for a person. */
  let human = false;

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
      person = { id, x: 0, z: 0, yaw: 0, dig: false, human, seen: Date.now(), socket };
      room(inRoom).set(id, person);
      tell(socket, { t: 'you', id, human });
      // and the world as it stands: every plot the index has said, every
      // place remembered for everybody — so nothing need be asked over HTTP
      tell(socket, { t: 'world', block: graphBlock, plots: [...plots.values()], revealed: keptPlaces() });
      return;
    }
    // a token from a verified selfie check: this one stands here as a person
    if (message.t === 'human') {
      human = personWith(message.token);
      if (person) person.human = human;
      tell(socket, { t: 'you', id, human });
      return;
    }
    // somebody went to an address and found something standing there: the
    // room is told, and the place is remembered for everybody on a person's
    // word, or on enough strangers' — see STRANGER_WORD
    if (message.t === 'saw' && person && typeof message.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(message.address)) {
      const now = Date.now();
      if (now - (person.lastSaw ?? 0) < SAWS_AT_MOST_EVERY) return;
      person.lastSaw = now;
      const address = message.address.toLowerCase();
      const worth = person.human ? 1 : STRANGER_WORD;
      let it = revealed.get(address);
      if (it) {
        it.count += 1;
        // one voice counts once, however often it speaks
        if (it.kept || it.by.has(id)) return;
        it.by.add(id);
        it.weight += worth;
      } else {
        if (revealed.size >= REVEALED_MOST) return;
        it = { at: now, count: 1, weight: worth, kept: false, by: new Set([id]) };
        revealed.set(address, it);
        // heard by the room at once, whoever said it
        if (inRoom) for (const other of room(inRoom).values()) if (other.id !== id) tell(other.socket, { t: 'revealed', addresses: [address] });
      }
      if (it.weight >= 1 - 1e-9 && !it.kept) {
        it.kept = true;
        saveRevealed();
      }
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
    const everyone = [...people.values()].map((p) => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, dig: p.dig, human: Boolean(p.human) }));
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
    const fresh = [];
    for (const [id, row] of rows) {
      const had = plots.get(id);
      if (had && Number(had.updatedIn) >= Number(row.updatedIn) && JSON.stringify(had) === JSON.stringify(row)) continue;
      plots.set(id, row);
      fresh.push(row);
    }
    graphBlock = Math.max(graphBlock, top);
    if (fresh.length) for (const person of room(ROOM).values()) tell(person.socket, { t: 'changed', block: graphBlock, plots: fresh });
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
    // the rows themselves, as the index shapes them: the pages fold them in and ask nothing more
    for (const person of room(ROOM).values()) tell(person.socket, { t: 'changed', block: graphBlock, plots: rows });
    console.log(`${new Date().toISOString()} told ${room(ROOM).size} about ${rows.length} changed plot(s)`);
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

http.listen(PORT, () => console.log(`live on :${PORT}, watching ${SUBGRAPH || 'nothing'} for ${ROOM}; world id ${worldSet ? `on (${WORLD.environment}, action ${WORLD.action})` : 'off'}`));
