import { jest as Jest } from "@jest/globals";
import { Options } from "express-rate-limit";

import RedisStore from "../src/index.js";

interface Hit {
  count: number;
  expiry: number;
  timeout?: NodeJS.Timeout;
}

class MockRedisClient {
  hits: Map<string, Hit>;

  constructor() {
    this.hits = new Map<string, Hit>();
  }

  sendCommand(...args: string[]): number {
    if (args[0] === "INCR") {
      const key = args[1];
      const hit: Hit = this.hits.get(key) ?? {
        count: 0,
        expiry: -1,
        timeout: undefined,
      };
      hit.count += 1;
      this.hits.set(key, hit);

      return hit.count;
    }

    if (args[0] === "DECR") {
      const key = args[1];
      const hit: Hit = this.hits.get(key) ?? {
        count: 1,
        expiry: -1,
        timeout: undefined,
      };
      hit.count -= 1;
      this.hits.set(key, hit);

      return hit.count;
    }

    if (args[0] === "DEL") {
      const key = args[1];

      this.hits.delete(key);

      return 1;
    }

    if (args[0] === "PTTL") {
      const key = args[1];

      const hit = this.hits.get(key);
      if (!hit) return -1;

      return Math.max(hit.expiry - Date.now(), -1);
    }

    if (args[0] === "PEXPIRE") {
      const key = args[1];
      const expiry = Number.parseInt(args[2], 10);

      const hit = this.hits.get(key);
      if (!hit) return 0;
      if (hit.timeout) clearTimeout(hit.timeout);

      hit.expiry = Date.now() + expiry;
      hit.timeout = setTimeout(() => this.hits.delete(key), expiry);
      this.hits.set(key, hit);

      return 1;
    }

    return -2;
  }
}

describe("redis store test", () => {
  beforeEach(() => Jest.useFakeTimers("modern"));
  afterEach(() => {
    Jest.useRealTimers();
    Jest.restoreAllMocks();
  });

  it("supports custom prefixes", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
      prefix: "test-",
    });
    store.init({ windowMs: 1 } as Options);

    const key = "store";

    await store.increment(key);

    expect(client.hits.get("test-store")).not.toBeUndefined();
    expect(client.hits.get("test-store")!.count).toEqual(1);
    expect(client.hits.get("test-store")!.expiry).toBeGreaterThan(Date.now());
  });

  it("sets the value to 1 on first call to `increment`", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
    });
    store.init({ windowMs: 1 } as Options);

    const key = "test-store";

    const { totalHits } = await store.increment(key);
    expect(totalHits).toEqual(1);
  });

  it("increments the key for the store when `increment` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
    });
    store.init({ windowMs: 1 } as Options);

    const key = "test-store";

    await store.increment(key);

    const { totalHits } = await store.increment(key);
    expect(totalHits).toEqual(2);
  });

  it("decrements the key for the store when `decrement` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
    });
    store.init({ windowMs: 1 } as Options);

    const key = "test-store";

    await store.increment(key);
    await store.increment(key);
    await store.decrement(key);

    const { totalHits } = await store.increment(key);
    expect(totalHits).toEqual(2);
  });

  it("resets the count for a key in the store when `resetKey` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
    });
    store.init({ windowMs: 1 } as Options);

    const key = "test-store";

    await store.increment(key);
    await store.resetKey(key);

    const { totalHits } = await store.increment(key);
    expect(totalHits).toEqual(1);
  });

  it("resets expiry time on change if `resetExpiryOnChange` is set to `true`", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(...args),
      resetExpiryOnChange: true,
    });
    store.init({ windowMs: 60 } as Options);

    const key = "test-store";

    await store.increment(key);

    expect(client.hits.get("rl:test-store")).not.toBeUndefined();
    expect(client.hits.get("rl:test-store")!.count).toEqual(1);
    const firstExpiry = client.hits.get("rl:test-store")!.expiry;

    Jest.advanceTimersByTime(50);

    await store.increment(key);

    expect(client.hits.get("rl:test-store")).not.toBeUndefined();
    expect(client.hits.get("rl:test-store")!.count).toEqual(2);
    expect(client.hits.get("rl:test-store")!.expiry).not.toEqual(firstExpiry);
  });

  describe("reset time", () => {
    beforeEach(() => Jest.useFakeTimers("modern"));
    afterEach(() => Jest.useRealTimers());

    it("resets the count for all the keys in the store when the timeout is reached", async () => {
      const client = new MockRedisClient();
      const store = new RedisStore({
        sendCommand: (...args: string[]) => client.sendCommand(...args),
      });
      store.init({ windowMs: 50 } as Options);

      const keyOne = "test-store-one";
      const keyTwo = "test-store-two";

      await store.increment(keyOne);
      await store.increment(keyTwo);

      Jest.advanceTimersByTime(60);

      const { totalHits: totalHitsOne } = await store.increment(keyOne);
      const { totalHits: totalHitsTwo } = await store.increment(keyTwo);
      expect(totalHitsOne).toEqual(1);
      expect(totalHitsTwo).toEqual(1);
    });
  });
});
