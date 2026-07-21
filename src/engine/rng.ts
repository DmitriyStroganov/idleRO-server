/**
 * Deterministic RNG for the engine.
 *
 * All in-engine randomness MUST flow through these functions, never Math.random().
 * This is what allows (a) replaying a match from a seed, and (b) PvP arena —
 * two AI patterns clash in a fully reproducible simulation.
 *
 * Algorithm: SplitMix64 + xorshift32 hybrid. Fast, well-distributed, seedable.
 */

/** Mutable state — pass by reference. */
export interface RngState {
  /** 64-bit state as [low, high] (Number-safe: low < 2^32). */
  lo: number;
  hi: number;
}

/** Create a fresh RNG state from a single 32-bit seed. */
export function createRng(seed: number): RngState {
  // SplitMix64 to expand a 32-bit seed into 64 bits.
  const s = seed >>> 0;
  let z = (s + 0x9e3779b9) >>> 0;
  const lo = z;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x21f0aaad);
  z = Math.imul(z, 0x735a2d97);
  z = (z ^ (z >>> 15)) >>> 0;
  const hi = z || 0x12345;
  return { lo: lo || 0xdeadbeef, hi };
}

/** Advance the generator and return a 32-bit unsigned int. */
export function nextU32(state: RngState): number {
  const { lo, hi } = state;
  let x = lo ^ (lo << 13);
  x = x ^ (x >>> 7);
  x = x ^ (x << 17);
  // xorshift over the 64-bit pair
  state.lo = hi;
  const newHi = (lo ^ (hi >>> 0)) >>> 0;
  state.hi = newHi ^ ((x >>> 0) ^ newHi);
  // mix out a result
  let z = state.hi + 0x9e3779b9;
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x85ebca6b);
  z = (z ^ (z >>> 13)) >>> 0;
  z = Math.imul(z, 0xc2b2ae35);
  z = (z ^ (z >>> 16)) >>> 0;
  return z >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(state: RngState): number {
  // 24 high bits / 2^24 for maximum precision within float mantissa.
  return (nextU32(state) >>> 8) / 0x1000000;
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(state: RngState, min: number, max: number): number {
  if (max < min) {
    throw new Error(`nextInt: max (${max}) < min (${min})`);
  }
  const range = max - min + 1;
  return min + (nextU32(state) % range);
}

/** Standard normal-ish (sum of 3 uniforms, range ~[-3,3]). */
export function nextGauss(state: RngState): number {
  return (nextFloat(state) + nextFloat(state) + nextFloat(state) - 1.5);
}

/** True with the given probability in [0,1]. */
export function nextChance(state: RngState, p: number): boolean {
  return nextFloat(state) < p;
}

/** Pick a random element of an array. */
export function nextPick<T>(state: RngState, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('nextPick: empty array');
  return arr[nextInt(state, 0, arr.length - 1)]!;
}
