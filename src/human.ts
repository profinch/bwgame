/**
 * Standing here as a person.
 *
 * The world resolves faster with more people in it, and what one finds is
 * kept for all — which invites one person with fifty tabs. World's Selfie
 * Check says one live person is behind this screen: the check runs in the
 * World App against a selfie, IDKit brings the proof back, and the live server
 * has World verify it against the request it signed. What it earns is not a
 * name and not a wallet — the world has no idea who you are — but weight: a
 * person's word about a place is kept for everybody at once, a stranger's is
 * heard by the room and kept once three strangers agree (live/server.js,
 * STRANGER_WORD). The token it earns is kept in this browser for the ninety
 * days the credential is good for, and shown to the server on every visit.
 *
 * Without a live server on the chain there is no room to stand in and the
 * panel says so; without World's keys on the server, likewise.
 */
import type { Live } from './live';

export interface Human {
  /** Hold the panel still — the onboarding speaks through it — or let it speak again. */
  pause(on: boolean): void;
}

/** Where the token is kept in this browser: `{ token, until }`. */
const KEPT_AS = 'gs-person';

interface Kept {
  token: string;
  until: number;
}

/** What the server hands the page to give IDKit. */
interface Request {
  app_id: `app_${string}`;
  action: string;
  environment: 'production' | 'staging' | 'sandbox';
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
}

function kept(): Kept | null {
  try {
    const it = JSON.parse(localStorage.getItem(KEPT_AS) ?? 'null') as Kept | null;
    if (!it || typeof it.token !== 'string' || typeof it.until !== 'number' || it.until <= Date.now()) return null;
    return it;
  } catch {
    return null;
  }
}

function keep(it: Kept | null): void {
  try {
    if (it) localStorage.setItem(KEPT_AS, JSON.stringify(it));
    else localStorage.removeItem(KEPT_AS);
  } catch {
    // no storage: a person for this visit only
  }
}

/** A date as the panel says it: 11.12.2026. */
function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** What went wrong, in the panel's words. */
export function whySaid(code: string): string {
  switch (code) {
    case 'user_rejected':
      return 'declined in the World App. a stranger here, then — the world works the same';
    case 'timeout':
      return 'nobody scanned it in time. try again whenever';
    case 'credential_unavailable':
    case 'feature_unavailable':
      return 'the World App has no selfie check for this account yet: set it up there first';
    case 'verification_rejected':
      return 'the check did not pass';
    case 'max_verifications_reached':
      return 'this credential has been used for this already';
    case 'connection_failed':
      return 'the World App could not reach the bridge';
    default:
      return `the check did not go through: ${code}`;
  }
}

export function beHuman(panel: HTMLElement, feed: string | null, live: Live | null): Human {
  const said = panel.querySelector<HTMLElement>('.person-said')!;
  const note = panel.querySelector<HTMLElement>('.person-note')!;
  const doing = panel.querySelector<HTMLElement>('.person-do')!;
  const prove = panel.querySelector<HTMLButtonElement>('.prove')!;
  const code = panel.querySelector<HTMLElement>('.person-code')!;
  const qr = panel.querySelector<HTMLCanvasElement>('.person-qr')!;
  const how = panel.querySelector<HTMLElement>('.person-how')!;
  const open = panel.querySelector<HTMLAnchorElement>('.person-open')!;
  const cancel = panel.querySelector<HTMLButtonElement>('.person-cancel')!;

  let held = false;
  let asking: AbortController | null = null;
  /** Whether the server has World's keys: asked once at the start, and again now and then if not. */
  let serverSet: boolean | null = null;
  let askedServerAt = 0;
  const askServer = () => {
    if (!feed || Date.now() - askedServerAt < 60_000) return;
    askedServerAt = Date.now();
    void fetch(feed, { headers: { accept: 'application/json' } })
      .then((answer) => (serverSet = answer.status !== 503))
      .catch(() => (serverSet = serverSet ?? null));
  };
  /** Until when the panel keeps the last word about a check that did not go through. */
  let saidUntil = 0;

  const state = (of: 'idle' | 'asking' | 'person' | 'none') => {
    doing.hidden = of !== 'idle';
    code.hidden = of !== 'asking';
    prove.disabled = of === 'asking';
  };

  /** The panel as things stand: no room, no check, a stranger, a person. */
  const look = () => {
    if (held || asking || Date.now() < saidUntil) return;
    if (!live || !feed) {
      state('none');
      said.textContent = 'you, here';
      note.textContent = 'there is no room on this chain to stand in: nobody to be a person to';
      return;
    }
    askServer();
    const have = kept();
    if (!have && serverSet === false) {
      state('none');
      said.textContent = 'a stranger, here';
      note.textContent = 'the selfie check with World is not set up on this server yet: everybody here is a stranger, and the world works the same';
      return;
    }
    if (have) {
      state('person');
      said.textContent = live.human ? 'a person, here' : 'a person, as far as this browser knows';
      note.textContent =
        `checked with World until ${dayOf(have.until)}. ` +
        (live.human ? 'what you find here is kept for everybody at once' : 'the room has not heard it yet');
      return;
    }
    state('idle');
    said.textContent = 'a stranger, here';
    note.textContent =
      'anybody can be fifty tabs. a selfie check with World says one person is behind this screen: ' +
      'what a person finds is kept for everybody at once; what a stranger finds is heard by the room and kept once three strangers agree';
  };

  // told once the room has heard the token, or not
  const had = kept();
  if (had && live) live.asPerson(had.token);
  look();
  setInterval(look, 1000);

  /** A check that did not go through: said on the panel for a while, then back to the offer. */
  const fail = (why: string) => {
    asking = null;
    state('idle');
    said.textContent = 'a stranger, here';
    note.textContent = why;
    saidUntil = Date.now() + 12_000;
  };

  prove.addEventListener('click', async () => {
    if (!feed || asking) return;
    asking = new AbortController();
    const done = asking;
    state('asking');
    how.textContent = 'asking the server for a signed request…';
    open.hidden = true;
    try {
      const asked = await fetch(feed, { headers: { accept: 'application/json' } });
      if (asked.status === 503) throw new Error('the selfie check is not set up on this server yet');
      if (!asked.ok) throw new Error(`the server said ${asked.status}`);
      const request = (await asked.json()) as Request;
      // IDKit is a megabyte and wanted once, if ever: fetched when asked for
      const [{ IDKit, selfieCheckLegacy }, { toCanvas }] = await Promise.all([import('@worldcoin/idkit-core'), import('qrcode')]);
      const flow = await IDKit.request({
        app_id: request.app_id,
        action: request.action,
        rp_context: request.rp_context,
        allow_legacy_proofs: false,
        environment: request.environment,
        action_description: 'stand in Ground State as a person',
      }).preset(selfieCheckLegacy());
      if (done.signal.aborted) return;
      await toCanvas(qr, flow.connectorURI, { width: 168, margin: 1, color: { dark: '#2a2a28', light: '#ffffff' } });
      open.href = flow.connectorURI;
      open.hidden = false;
      how.textContent = 'scan with the World App, or open it on this phone. the check is a selfie: one live person behind the screen';
      const outcome = await flow.pollUntilCompletion({ pollInterval: 1500, timeout: 300_000, signal: done.signal });
      if (done.signal.aborted) return;
      if (!outcome.success) return fail(whySaid(String(outcome.error)));
      how.textContent = 'checked in the app. the server is having World verify it…';
      const verified = await fetch(feed, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ result: outcome.result }),
      });
      const verdict = (await verified.json()) as { token?: string; until?: number; error?: string };
      if (!verified.ok || !verdict.token || !verdict.until) return fail(`World did not accept it: ${verdict.error ?? verified.status}`);
      keep({ token: verdict.token, until: verdict.until });
      live?.asPerson(verdict.token);
      asking = null;
      look();
    } catch (error) {
      if (done.signal.aborted) return;
      fail((error as { message?: string }).message ?? 'the check did not go through');
    }
  });

  cancel.addEventListener('click', () => {
    asking?.abort();
    asking = null;
    saidUntil = 0;
    look();
  });

  return {
    pause(on: boolean) {
      held = on;
      if (on) {
        asking?.abort();
        asking = null;
      } else look();
    },
  };
}
