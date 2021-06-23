export default interface Store {
  /**
   * Increments the value in the underlying store for the given key.
   * @method function
   * @param {string} key - The key to use as the unique identifier passed
   *                     down from RateLimit.
   * @param {Function} cb - The callback issued when the underlying
   *                                store is finished.
   *
   * The callback should be called with three values:
   *  - error (usually null)
   *  - hitCount for this IP
   *  - resetTime - JS Date object (optional, but necessary for X-RateLimit-Reset header)
   */
  incr(
    key: string,
    cb: (err?: Error, hitCount?: number, resetTime?: Date) => void
  ): void;

  /**
   * Decrements the value in the underlying store for the given key. Used only when skipFailedRequests is true
   * @method function
   * @param {string} key - The key to use as the unique identifier passed
   *                     down from RateLimit.
   */
  decr(key: string): void;

  /**
   * Resets a value with the given key.
   * @method function
   * @param  {string} key - The key to reset
   */
  resetKey(key: string): void;
}
