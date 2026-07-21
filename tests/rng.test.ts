/**
 * RNG determinism tests.
 * The whole PvP arena idea rests on this property:
 *   same seed → same stream of values, in any environment.
 */

import { describe, it, expect } from 'vitest';
import { createRng, nextU32, nextFloat, nextInt, nextChance } from '@engine/rng';

describe('deterministic RNG', () => {
  it('same seed → same first 1000 values', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      expect(nextU32(a)).toBe(nextU32(b));
    }
  });

  it('different seeds → different streams (probabilistic)', () => {
    const a = createRng(1);
    const b = createRng(2);
    let mismatches = 0;
    for (let i = 0; i < 1000; i++) {
      if (nextU32(a) !== nextU32(b)) mismatches++;
    }
    expect(mismatches).toBeGreaterThan(990);
  });

  it('nextFloat is in [0, 1)', () => {
    const s = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const f = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('nextInt respects bounds', () => {
    const s = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const n = nextInt(s, 5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('nextChance(p=0.5) lands ~50% over 10k samples', () => {
    const s = createRng(7);
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      if (nextChance(s, 0.5)) hits++;
    }
    // Allow ±3% slack.
    expect(hits).toBeGreaterThan(4700);
    expect(hits).toBeLessThan(5300);
  });
});
