/**
 * Cryptographically Secure Random Utilities
 *
 * These utilities use the Web Crypto API to generate cryptographically secure
 * random values without modulo bias.
 */

/**
 * Returns a uniformly distributed integer in [0, maxExclusive) using rejection sampling.
 * This avoids modulo bias when mapping crypto.getRandomValues() to a smaller range.
 *
 * @param maxExclusive - The exclusive upper bound (must be a positive integer)
 * @returns A random integer in [0, maxExclusive)
 * @throws Error if maxExclusive is not a positive integer
 *
 * @example
 * // Get a random index for an array
 * const index = getSecureRandomInt(array.length);
 *
 * @example
 * // Get a random delay between 0-4999ms
 * const delay = getSecureRandomInt(5000);
 */
export const getSecureRandomInt = (maxExclusive: number): number => {
  if (maxExclusive <= 0 || !Number.isInteger(maxExclusive)) {
    throw new Error('maxExclusive must be a positive integer');
  }

  const maxUint32 = 0x100000000; // 2^32
  const limit = Math.floor(maxUint32 / maxExclusive) * maxExclusive;
  const randomValues = new Uint32Array(1);

  // Rejection sampling: discard values that would cause bias
  let value: number;
  do {
    crypto.getRandomValues(randomValues);
    value = randomValues[0];
  } while (value >= limit);

  return value % maxExclusive;
};
