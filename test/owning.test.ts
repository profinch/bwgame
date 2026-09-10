import { describe, expect, it } from 'vitest';
import { encodeAddress, encodeString } from '../src/owning';

// what `cast abi-encode` says the same arguments come to
describe('what a plot is told', () => {
  it('encodes a string as the chain expects it', () => {
    expect(`0x${encodeString('the counting house')}`).toBe('0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001274686520636f756e74696e6720686f7573650000000000000000000000000000');
    expect(`0x${encodeString('x')}`).toBe('0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000017800000000000000000000000000000000000000000000000000000000000000');
    expect(encodeString('').length).toBe(128);
  });

  it('encodes an address as one word', () => {
    expect(`0x${encodeAddress('0x784379Da6111c8Ff4A5Ea78f22aED9cB1F938df1')}`).toBe('0x000000000000000000000000784379da6111c8ff4a5ea78f22aed9cb1f938df1');
  });
});
