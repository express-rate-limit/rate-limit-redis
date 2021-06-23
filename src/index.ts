import { Redis as IORedisClient } from 'ioredis';
import { RedisClient as RedisClient } from 'redis';

import Store from './store';

type Client = IORedisClient | RedisClient;
type RedisMultiReply = [Error | null, number] | number;

interface Options {
  /**
   * client is the ioredis or redis client to use for operations.
   */
  client: Client;

  /**
   * passIfNotConnected will allow requests to get processed as if they
   * succeeded.
   */
  passIfNotConnected?: boolean;

  /**
   * prefix is the prefix string to add to entries in Redis.
   */
  prefix?: string;

  /**
   * resetExpiryOnChange when true indicates that the expiry time should be
   * reset every time a key is incremented/decremented. This means that when the
   * limit is reached and the user is given a 429 response, the rate limit
   * window is extended.
   */
  resetExpiryOnChange?: boolean;

  /**
   * expiry is the number of seconds that each rate limiting window will exist
   * for.
   */
  expiry?: number;
}

function parseReply(reply: RedisMultiReply): number | null {
  if (Array.isArray(reply)) {
    if (reply.length !== 2 || reply[0]) {
      return null;
    }

    return reply[1];
  }

  return reply;
}

class RedisStore implements Store {
  private readonly client: Client;
  private readonly passIfNotConnected: boolean;
  private readonly prefix: string;
  private readonly resetExpiryOnChange: boolean;
  private readonly expiryMS: number;

  constructor({
    client,
    passIfNotConnected = false,
    prefix = 'rl:',
    resetExpiryOnChange = false,
    expiry = 60,
  }: Options) {
    this.client = client;
    this.passIfNotConnected = passIfNotConnected;
    this.prefix = prefix;
    this.resetExpiryOnChange = resetExpiryOnChange;
    this.expiryMS = expiry * 1000;
  }

  private prefixKey(key: string) {
    return `${this.prefix}${key}`;
  }

  private exec(
    key: string,
    increment: number,
    cb?: (err?: Error, replies?: { ttl: number; hits: number }) => void
  ): void {
    const prefixed = this.prefixKey(key);

    if (
      this.passIfNotConnected &&
      !(
        (this.client as IORedisClient).status === 'ready' ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
        (this.client as unknown as any).ready
      )
    ) {
      if (!cb) {
        return;
      }

      return cb();
    }

    const pipeline = this.client.multi();
    pipeline.incrby(prefixed, increment);
    pipeline.pttl(prefixed);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    pipeline.exec((err, replies: RedisMultiReply[]) => {
      if (!cb) {
        return;
      }

      if (err) {
        return cb(err);
      }

      // If the replies are invalid, return an empty response.
      if (replies.length !== 2) {
        return cb(undefined, { ttl: this.expiryMS, hits: 0 });
      }

      const hits = parseReply(replies[0]);
      if (hits === null) {
        return cb(undefined, { ttl: this.expiryMS, hits: 0 });
      }

      let ttl = parseReply(replies[1]);
      if (ttl === null) {
        return cb(undefined, { ttl: this.expiryMS, hits: 0 });
      }

      // If the key has no expiry, or the expiry was configured to be reset on
      // each change, then reset it now.
      if (this.resetExpiryOnChange || hits === 1 || ttl === -1) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.client.pexpire(prefixed, this.expiryMS);

        ttl = this.expiryMS;
      }

      return cb(undefined, { ttl, hits });
    });
  }

  public incr(
    key: string,
    cb: (err?: Error, hitCount?: number, resetTime?: Date) => void
  ): void {
    this.exec(key, 1, (err, replies) => {
      if (err || !replies) {
        return cb(err);
      }

      return cb(
        undefined,
        replies.hits,
        replies.ttl > 0 ? new Date(Date.now() + replies.ttl) : undefined
      );
    });
  }

  public decr(key: string): void {
    this.exec(key, -1);
  }

  public resetKey(key: string): void {
    const prefixed = this.prefixKey(key);

    // The underlying return types for this function do not overlap but as we
    // are not interested in the return, we can safely ignore this specific
    // case.

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.client.del(prefixed);
  }
}

export default RedisStore;
