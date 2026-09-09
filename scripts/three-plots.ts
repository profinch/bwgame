/**
 * Three plots, next to each other, on a chain of our own.
 *
 * Spins up anvil, deploys the factory, mines salts until three land within a
 * chosen distance of one another, claims them, and reports where they actually
 * ended up. The point is not that it works — the contracts have tests for that
 * — but what it costs: how many hashes buy how much precision.
 *
 *   npx tsx scripts/three-plots.ts [metres]
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { keccak_256 } from '@noble/hashes/sha3';
import { DEPTH, HOME } from '../src/engine/land';
import { type Found, type Ground, type MineExports, hexOf, miner } from '../src/mine';

const RPC = 'http://127.0.0.1:8545';
const WITHIN = Number(process.argv[2] ?? 20_000);
const WORLD = 4 ** DEPTH;

// --- talking to the chain --------------------------------------------------

let id = 0;
async function call<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const answer = (await response.json()) as { result?: T; error?: { message: string } };
  if (answer.error) throw new Error(`${method}: ${answer.error.message}`);
  return answer.result as T;
}

const selector = (signature: string) => hexOf(keccak_256(new TextEncoder().encode(signature)).subarray(0, 4));

async function send(from: string, to: string | null, data: string): Promise<string> {
  const hash = await call<string>('eth_sendTransaction', [
    { from, ...(to ? { to } : {}), data, gas: '0x1c9c380' }, // 30M, a block's worth
  ]);
  for (let i = 0; i < 200; i++) {
    const receipt = await call<{ status: string; contractAddress: string | null } | null>(
      'eth_getTransactionReceipt',
      [hash],
    );
    if (receipt) {
      if (receipt.status !== '0x1') throw new Error('the transaction reverted');
      return receipt.contractAddress ?? '';
    }
    await new Promise((wake) => setTimeout(wake, 50));
  }
  throw new Error('no receipt');
}

// --- the run ---------------------------------------------------------------

const anvil = spawn(`${process.env.HOME}/.foundry/bin/anvil`, ['--silent'], { stdio: 'ignore' });
process.on('exit', () => anvil.kill());

async function main() {
  for (let i = 0; ; i++) {
    try {
      await call('eth_blockNumber', []);
      break;
    } catch {
      if (i > 60) throw new Error('anvil never answered');
      await new Promise((wake) => setTimeout(wake, 150));
    }
  }

  const [deployer, ...others] = await call<string[]>('eth_accounts', []);
  const owners = [deployer!, others[0]!, others[1]!];

  const artifact = JSON.parse(readFileSync('contracts/out/Plot.sol/Plots.json', 'utf8')) as {
    bytecode: { object: string };
  };
  const factory = await send(deployer!, null, artifact.bytecode.object);
  const codeHash = await call<string>('eth_call', [
    { to: factory, data: selector('plotCodeHash()') },
    'latest',
  ]);

  console.log(`\nworld ${(WORLD / 1000).toLocaleString('en')} km across at depth ${DEPTH}`);
  console.log(`factory ${factory}`);
  console.log(`three plots, each within ${WITHIN.toLocaleString('en')} m of the first\n`);

  // the same module the browser's workers run, straight off the disk
  const { instance } = await WebAssembly.instantiate(readFileSync('src/mine.wasm'), {});
  const exports = instance.exports as unknown as MineExports;

  const plots: { found: Found; owner: string; seconds: number; tries: number }[] = [];
  let target: Ground = { x: 0, z: 0 };

  for (let n = 0; n < 3; n++) {
    // the first one may land anywhere; the others have to come to it
    const within = n === 0 ? WORLD : WITHIN;
    const started = Date.now();
    let tries = 0;
    let from = 0n;
    let found: Found | null = null;

    const mine = miner(exports, { factory, owner: owners[n]!, home: HOME, codeHash, target, within });
    while (!found) {
      const round = mine.run(from, 1n);
      tries += round.tries;
      from = round.next;
      if (round.close) found = round.best;
    }

    const seconds = (Date.now() - started) / 1000;
    console.log(
      `plot ${n + 1}  ${found.address}  ${tries.toLocaleString('en')} tries in ${seconds.toFixed(1)} s` +
        `  (${(tries / seconds / 1e6).toFixed(2)} M/s)`,
    );
    if (n === 0) target = found.ground;
    plots.push({ found, owner: owners[n]!, seconds, tries });
  }

  console.log('');
  for (const { found, owner } of plots) {
    const at = await send(owner, factory, selector('claim(bytes32)') + found.salt.slice(2));
    void at;
    const code = await call<string>('eth_getCode', [found.address, 'latest']);
    const standing = code !== '0x' && code.length > 2;
    console.log(
      `claimed ${found.address} by ${owner.slice(0, 10)}…  ${standing ? 'standing' : 'MISSING'}` +
        `  at (${found.ground.x.toLocaleString('en')}, ${found.ground.z.toLocaleString('en')}) m from home`,
    );
  }

  console.log('\nhow far apart they came out:');
  for (let a = 0; a < plots.length; a++) {
    for (let b = a + 1; b < plots.length; b++) {
      const one = plots[a]!.found.ground;
      const two = plots[b]!.found.ground;
      const away = Math.hypot(one.x - two.x, one.z - two.z);
      console.log(`  ${a + 1} to ${b + 1}:  ${Math.round(away).toLocaleString('en')} m`);
    }
  }

  // the first plot took no searching, so it says nothing about the rate
  const worked = plots.filter((p) => p.seconds > 0.5);
  const rate = worked.reduce((sum, p) => sum + p.tries / p.seconds, 0) / Math.max(1, worked.length);
  console.log(`\none thread does ${(rate / 1e6).toFixed(2)} M hashes a second. At that rate:`);
  for (const metres of [20_000, 5_000, 1_000, 200, 30]) {
    const tries = (WORLD / metres) ** 2;
    const seconds = tries / (rate * 8); // eight threads, as a browser would
    const time =
      seconds < 90 ? `${seconds.toFixed(0)} s` :
      seconds < 5400 ? `${(seconds / 60).toFixed(0)} min` :
      seconds < 172800 ? `${(seconds / 3600).toFixed(0)} h` :
      `${(seconds / 86400).toFixed(1)} days`;
    console.log(`  within ${metres.toLocaleString('en').padStart(7)} m — ${time.padStart(9)} on eight threads`);
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((why) => {
    console.error(why);
    process.exit(1);
  });
