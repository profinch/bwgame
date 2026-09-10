import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Account } from '../src/chain';
import { BOULDER_ACROSS, blocksOf, bouldersOf, piecesOf, structureOf } from '../src/places';
import { OUTLINED, glassOf, inkOf, strokesOf } from '../src/blueprint';
import { PLOT_CODE_SIZE, isPlot, plotsIn, plotsInGraph, relicOf } from '../src/plot';

/**
 * A plot's runtime code as it stands on Sepolia — the first plot of the third
 * factory, read off the chain. Not the compiled artifact: the compiler stamps
 * its settings into the code's tail, so a build with other remappings comes out
 * a few bytes different from what the factory actually deploys.
 */
const code = readFileSync('test/fixtures/plot-v3.hex', 'utf8').trim().slice(2);

describe('knowing a plot by its code', () => {
  it('is the plot as deployed, exactly', () => {
    expect(code.length).toBe(PLOT_CODE_SIZE * 2);
    expect(isPlot(code)).toBe(true);
    expect(isPlot(`0x${code}`)).toBe(true);
    expect(isPlot(code.toUpperCase())).toBe(true);
  });

  it('is not anything else, whatever its size', () => {
    expect(isPlot('60806040')).toBe(false);
    expect(isPlot('')).toBe(false);
    expect(isPlot('ab'.repeat(PLOT_CODE_SIZE))).toBe(false);
    expect(isPlot(code.slice(0, -2) + '00')).toBe(false);
  });
});

describe('the plots of earlier grounds', () => {
  it('knows neither ground in random bytes, and does not mistake a plot for a relic', () => {
    expect(relicOf('ab'.repeat(1068))).toBeNull();
    expect(relicOf('ab'.repeat(1263))).toBeNull();
    expect(relicOf('')).toBeNull();
    expect(relicOf(code)).toBeNull();
  });

  it('stands a relic of the first ground as a boulder with a carved plaque', () => {
    const account: Account = { address: '0x3095c19c9105b97eab5403753f9539a71a701a27', codeSize: 1068, code: 'ab'.repeat(1068), balance: 0n, nonce: 1 };
    const stone = structureOf(account, [], undefined, null, 1);
    expect(stone.kind).toBe('relic');
    expect(stone.relic).toBe(1);
    expect(stone.wide).toBeGreaterThan(BOULDER_ACROSS * 0.8);
    expect(stone.tall).toBeCloseTo(stone.wide * 0.78, 6);
    // the boulder is one instance of the stone shape; the plaque is many boxes
    expect(bouldersOf([stone], () => 10).length / 9).toBe(1);
    expect(piecesOf(stone, 10).length / 9).toBeGreaterThan(20);
    // and it is walked round as a whole
    expect(blocksOf(stone, 10)).toHaveLength(1);
  });

  it('stands a relic of the second ground as a gate you can walk through', () => {
    const account: Account = { address: '0x3095c19c9105b97eab5403753f9539a71a701a27', codeSize: 1263, code: 'ab'.repeat(1263), balance: 0n, nonce: 1 };
    const gate = structureOf(account, [], undefined, null, 2);
    expect(gate.relic).toBe(2);
    expect(gate.tall).toBeGreaterThan(3.5);
    expect(gate.wide).toBeGreaterThan(3.5);
    expect(bouldersOf([gate], () => 10).length).toBe(0);
    // two piers of carving and a lintel
    expect(piecesOf(gate, 10).length / 9).toBeGreaterThan(20);
    const blocks = blocksOf(gate, 10);
    expect(blocks).toHaveLength(2);
    // the piers stand apart, with nothing between them
    expect(Math.hypot(blocks[0]!.x - blocks[1]!.x, blocks[0]!.z - blocks[1]!.z)).toBeGreaterThan(2.5);
    expect(blocksOf(structureOf({ ...account, code: 'cd'.repeat(2271), codeSize: 2271 }, [], undefined, { note: '' }), 10)).toHaveLength(0);
  });
});

describe('a plot nobody has written into', () => {
  const plot: Account = {
    address: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1',
    codeSize: PLOT_CODE_SIZE,
    code: 'cd'.repeat(PLOT_CODE_SIZE),
    balance: 0n,
    nonce: 1,
  };

  it('is a drawing, and one that has been written into is a building', () => {
    expect(structureOf(plot, [], undefined, { note: '' }).kind).toBe('framed');
    expect(structureOf(plot, [], undefined, { note: 'here, and on purpose' }).kind).toBe('built');
    expect(structureOf(plot).kind).toBe('built');
  });

  it('pointed at code, is that code standing here', () => {
    const casino: Account = { address: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1', codeSize: 12_000, code: '6080604052' + 'ff'.repeat(2000), balance: 0n, nonce: 1 };
    const pointed = structureOf(plot, [], undefined, { note: '', code: casino });
    const bare = structureOf(plot, [], undefined, { note: 'x' });
    expect(pointed.kind).toBe('built');
    expect(pointed.address).toBe(plot.address);
    expect(pointed.tall).toBeGreaterThan(bare.tall);
    expect(pointed.turn).not.toBe(bare.turn);
  });

  it('is drawn at seven tenths of the building it will be', () => {
    const drawing = structureOf(plot, [], undefined, { note: '' });
    const building = structureOf(plot, [], undefined, { note: 'here' });
    expect(drawing.wide).toBeCloseTo(building.wide * 0.7, 6);
    expect(drawing.deep).toBeCloseTo(building.deep * 0.7, 6);
    expect(drawing.tall).toBeCloseTo(building.tall * 0.7, 6);
    expect(drawing.turn).toBe(building.turn);
  });

  it('is the same shape whoever owns it, because the owner is not in the code', () => {
    const other: Account = { ...plot, address: '0x3095c19c9105b97eab5403753f9539a71a701a27' };
    const one = structureOf(plot, [], undefined, { note: '' });
    const two = structureOf(other, [], undefined, { note: '' });
    expect(two.wide).toBe(one.wide);
    expect(two.turn).toBe(one.turn);
  });

  it('is not made of stone', () => {
    expect(piecesOf(structureOf(plot, [], undefined, { note: '' }), 10).length).toBe(0);
  });

  it('reads the code it is pointed at off a subgraph answer', () => {
    const got = plotsInGraph({ data: { _meta: { block: { number: 1 } }, plots: [
      { id: '0x3095c19c9105b97eab5403753f9539a71a701a27', owner: { id: '0x01' }, note: '', updatedIn: '5', implementation: null },
      { id: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1', owner: { id: '0x02' }, note: '', updatedIn: '6', implementation: '0xabcdef0000000000000000000000000000000001' },
    ] } })!;
    expect(got.plots[0]!.implementation).toBeNull();
    expect(got.plots[1]!.implementation).toBe('0xabcdef0000000000000000000000000000000001');
  });

  it('is outlined in dashes, plan first, corners up, roof last, with the pen where it has got to', () => {
    const framed = structureOf(plot, [], undefined, { note: '' });
    const strokes = strokesOf(framed, 10);
    // dashes: many short strokes, none longer than a dash
    expect(strokes.length).toBeGreaterThan(12);
    for (const { from, to } of strokes) {
      expect(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])).toBeLessThanOrEqual(1.1 + 1e-6);
    }
    // the plan lies just above the ground and comes first; the roof comes last
    expect(strokes[0]!.from[1]).toBeCloseTo(10.04, 6);
    expect(strokes[strokes.length - 1]!.to[1]).toBeCloseTo(10 + framed.tall, 6);

    const eye: [number, number, number] = [40, 12, 40];
    const half: number[] = [];
    const pen = inkOf(strokes, OUTLINED / 2, eye, half);
    const whole: number[] = [];
    expect(inkOf(strokes, 1, eye, whole)).toBeNull();
    // every dash is six vertices of four floats, and no pen when done
    expect(whole.length).toBe(strokes.length * 6 * 4);
    expect(half.length).toBeLessThan(whole.length);
    expect(pen).not.toBeNull();
    expect(pen![1]).toBeGreaterThanOrEqual(10.04);
    expect(pen![1]).toBeLessThanOrEqual(10 + framed.tall);
  });

  it('glazes over once the outline is drawn: five panes, from nothing to smoked', () => {
    const framed = structureOf(plot, [], undefined, { note: '' });
    const none: number[] = [];
    glassOf(framed, 10, { x: 0, z: 0 }, OUTLINED, none);
    expect(none).toHaveLength(0);
    const some: number[] = [];
    glassOf(framed, 10, { x: 0, z: 0 }, (1 + OUTLINED) / 2, some);
    const all: number[] = [];
    glassOf(framed, 10, { x: 0, z: 0 }, 1, all);
    expect(all).toHaveLength(5 * 6 * 4);
    expect(some).toHaveLength(all.length);
    // the same panes, fainter on the way up
    expect(some[3]).toBeLessThan(all[3]!);
    expect(some[3]).toBeGreaterThan(0);
    expect(all[3]).toBeLessThan(0.3);
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

describe('the plots the subgraph says there are', () => {
  it('reads plot, owner, note and the block off an answer, and knows a non-answer', () => {
    const answer = {
      data: {
        _meta: { block: { number: 11669532 } },
        plots: [
          { id: '0x3095c19c9105b97eab5403753f9539a71a701a27', owner: { id: '0x3095c19c92551bba70bcfa9aafa99d145347b5f8' }, note: '', updatedIn: '11669116' },
          { id: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1', owner: { id: '0x9d25b864a22e36ca8fe285237b1a22b33cefbcc5' }, note: 'here', updatedIn: '11669500' },
          { id: 'nonsense' },
        ],
      },
    };
    expect(plotsInGraph(answer)).toEqual({
      block: 11669532,
      plots: [
        { plot: '0x3095c19c9105b97eab5403753f9539a71a701a27', owner: '0x3095c19c92551bba70bcfa9aafa99d145347b5f8', note: '', updatedIn: 11669116 },
        { plot: '0x784379da6111c8ff4a5ea78f22aed9cb1f938df1', owner: '0x9d25b864a22e36ca8fe285237b1a22b33cefbcc5', note: 'here', updatedIn: 11669500 },
      ],
    });
    expect(plotsInGraph({ errors: [{ message: 'no' }] })).toBeNull();
    expect(plotsInGraph(null)).toBeNull();
    expect(plotsInGraph({ data: { plots: [] } })).toEqual({ block: 0, plots: [] });
  });
});
