import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Account } from '../src/chain';
import { piecesOf, structureOf } from '../src/places';
import { PLOT_CODE_SIZE, isPlot, maskedPlotCode, plotsIn } from '../src/plot';

/** The compiled plot, if forge has built it here; the runtime code with the owner blank. */
const ARTIFACT = 'contracts/out/Plot.sol/Plot.json';
function compiledPlot(): string | null {
  if (!existsSync(ARTIFACT)) return null;
  const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as {
    deployedBytecode: { object: string; immutableReferences: Record<string, { start: number; length: number }[]> };
  };
  return artifact.deployedBytecode.object.slice(2);
}

/** That code as it would be on the chain for `owner`: the address written into both slots. */
function deployedFor(template: string, owner: string): string {
  const word = owner.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  let code = template;
  for (const at of [102, 331]) code = code.slice(0, at * 2) + word + code.slice(at * 2 + 64);
  return code;
}

describe('knowing a plot by its code', () => {
  const template = compiledPlot();

  it.skipIf(!template)('is the compiled plot, whoever owns it', () => {
    for (const owner of ['0x9d25B864a22e36Ca8fE285237B1a22b33cefbCc5', '0x3095c19c92551bba70bCFA9AAfa99D145347b5f8']) {
      const code = deployedFor(template!, owner);
      expect(code.length).toBe(PLOT_CODE_SIZE * 2);
      expect(isPlot(code)).toBe(true);
      expect(isPlot(`0x${code}`)).toBe(true);
    }
  });

  it('is not anything else, whatever its size', () => {
    expect(isPlot('60806040')).toBe(false);
    expect(isPlot('')).toBe(false);
    expect(isPlot('ab'.repeat(PLOT_CODE_SIZE))).toBe(false);
    expect(maskedPlotCode('ab'.repeat(PLOT_CODE_SIZE - 1))).toBeNull();
  });

  it('blanks exactly the owner and leaves the rest', () => {
    const code = 'ab'.repeat(PLOT_CODE_SIZE);
    const masked = maskedPlotCode(code)!;
    expect(masked.length).toBe(code.length);
    expect(masked.slice(102 * 2, 102 * 2 + 64)).toBe('0'.repeat(64));
    expect(masked.slice(0, 102 * 2)).toBe(code.slice(0, 102 * 2));
  });
});

describe('a plot nobody has written into', () => {
  const plot: Account = {
    address: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1',
    codeSize: PLOT_CODE_SIZE,
    code: 'ab'.repeat(PLOT_CODE_SIZE),
    balance: 0n,
    nonce: 1,
  };

  it('is a drawing, and one that has been written into is a building', () => {
    expect(structureOf(plot, [], undefined, { note: '' }).kind).toBe('framed');
    expect(structureOf(plot, [], undefined, { note: 'here, and on purpose' }).kind).toBe('built');
    expect(structureOf(plot).kind).toBe('built');
  });

  it('is drawn at seven tenths of the building it will be', () => {
    const drawing = structureOf(plot, [], undefined, { note: '' });
    const building = structureOf(plot, [], undefined, { note: 'here' });
    expect(drawing.wide).toBeCloseTo(building.wide * 0.7, 6);
    expect(drawing.deep).toBeCloseTo(building.deep * 0.7, 6);
    expect(drawing.tall).toBeCloseTo(building.tall * 0.7, 6);
    expect(drawing.turn).toBe(building.turn);
  });

  it('is the same shape whoever owns it', () => {
    const other: Account = { ...plot, code: 'ab'.repeat(102) + 'cd'.repeat(32) + 'ab'.repeat(PLOT_CODE_SIZE - 134) };
    const one = structureOf(plot, [], undefined, { note: '' });
    const two = structureOf(other, [], undefined, { note: '' });
    expect(two.wide).toBe(one.wide);
    expect(two.turn).toBe(one.turn);
  });

  it('is not made of stone', () => {
    expect(piecesOf(structureOf(plot, [], undefined, { note: '' }), 10).length).toBe(0);
  });
});

describe('the plots the factory says it made', () => {
  it('reads plot and owner off a Claimed log, and nothing off anything else', () => {
    // the first claim there was, Sepolia block 11669116
    const claimed = {
      topics: [
        '0xc32f9ef6676124cd4f64af9a81204b2f81c2dcd73e9f170cd114df97eb7c8fe4',
        '0x0000000000000000000000003095c19c9105b97eab5403753f9539a71a701a27',
        '0x0000000000000000000000003095c19c92551bba70bcfa9aafa99d145347b5f8',
      ],
    };
    const other = { topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x00', '0x00'] };
    expect(plotsIn([claimed, other])).toEqual([
      { plot: '0x3095c19c9105b97eab5403753f9539a71a701a27', owner: '0x3095c19c92551bba70bcfa9aafa99d145347b5f8' },
    ]);
  });
});
