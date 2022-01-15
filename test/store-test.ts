import { createHash } from "node:crypto";

import { jest as Jest } from "@jest/globals";
import { Options } from "express-rate-limit";
import MockRedisClient, { Redis } from "ioredis-mock";

import RedisStore, { RedisReply } from "../src/index.js";

// The SHA of the script to evaluate
let scriptSha: string | undefined;

/**
 * A wrapper around the mock redis client to call the right function, as the
 * `ioredis-mock` library does not have a send-raw-command function.
 *
 * @param {Redis} client - The mock Redis client.
 * @param {string[]} args - The raw command to send.
 *
 * @return {RedisReply | RedisReply[]} The reply returned by Redis.
 */
const sendCommand = async (
  client: Redis,
  args: string[]
): Promise<RedisReply | RedisReply[]> => {
  // `SCRIPT LOAD`, called when the store is initialized. This loads the lua script
  // for incrementing a client's hit counter.
  if (args[0] === "SCRIPT") {
    // `ioredis-mock` doesn't have a `SCRIPT LOAD` function, so we have to compute
    // the SHA manually and `EVAL` the script to get it saved.
    const shasum = createHash("sha1");
    shasum.update(args[2]);
    scriptSha = shasum.digest("hex");
    await client.eval(args[2], 1, "__test", "0", "100");

    // Return the SHA to the store.
    return scriptSha;
  }

  // `EVALSHA` executes the script that was loaded already with the given arguments
  if (args[0] === "EVALSHA")
    // @ts-expect-error Wrong types :/
    return client.evalsha(scriptSha!, ...args.slice(2)) as number[];
  // `DECR` decrements the count for a client.
  if (args[0] === "DECR") return client.decr(args[1]);
  // `DEL` resets the count for a client by deleting the key.
  if (args[0] === "DEL") return client.del(args[1]);

  // This should not happen
  return -99;
};

describe("redis store test", () => {
  // Mock timers so we can fast forward time instead of waiting for n seconds
  // in the timer section
  beforeEach(() => Jest.useFakeTimers("modern"));
  afterEach(() => {
    Jest.useRealTimers();
    Jest.restoreAllMocks();
  });

  it("supports custom prefixes", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
      prefix: "test-",
    });
    store.init({ windowMs: 10 } as Options);

    const key = "store";

    await store.increment(key);

    // Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
    // `windowMs`).
    expect(Number(await client.get("test-store"))).toEqual(1);
    expect(Number(await client.pttl("test-store"))).toEqual(10);
  });

  it("sets the value to 1 on first call to `increment`", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
    });
    store.init({ windowMs: 10 } as Options);

    const key = "test-store";

    const { totalHits } = await store.increment(key); // => 1

    // Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
    // `windowMs`).
    expect(totalHits).toEqual(1);
    expect(Number(await client.get("rl:test-store"))).toEqual(1);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(10);
  });

  it("increments the key for the store when `increment` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
    });
    store.init({ windowMs: 10 } as Options);

    const key = "test-store";

    await store.increment(key); // => 1
    const { totalHits } = await store.increment(key); // => 2

    // Ensure the hit count is 2, and the expiry is 10 milliseconds (value of
    // `windowMs`).
    expect(totalHits).toEqual(2);
    expect(Number(await client.get("rl:test-store"))).toEqual(2);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(10);
  });

  it("decrements the key for the store when `decrement` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
    });
    store.init({ windowMs: 10 } as Options);

    const key = "test-store";

    await store.increment(key); // => 1
    await store.increment(key); // => 2
    await store.decrement(key); // => 1
    const { totalHits } = await store.increment(key); // => 2

    // Ensure the hit count is 2, and the expiry is 10 milliseconds (value of
    // `windowMs`).
    expect(totalHits).toEqual(2);
    expect(Number(await client.get("rl:test-store"))).toEqual(2);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(10);
  });

  it("resets the count for a key in the store when `resetKey` is called", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
    });
    store.init({ windowMs: 10 } as Options);

    const key = "test-store";

    await store.increment(key); // => 1
    await store.resetKey(key); // => undefined

    const { totalHits } = await store.increment(key); // => 1

    // Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
    // `windowMs`).
    expect(totalHits).toEqual(1);
    expect(Number(await client.get("rl:test-store"))).toEqual(1);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(10);
  });

  it("resets expiry time on change if `resetExpiryOnChange` is set to `true`", async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args: string[]) => sendCommand(client, args),
      resetExpiryOnChange: true,
    });
    store.init({ windowMs: 60 } as Options);

    const key = "test-store";

    await store.increment(key); // => 1

    // Ensure the hit count is 1, and the expiry is 60 milliseconds (value of
    // `windowMs`).
    expect(Number(await client.get("rl:test-store"))).toEqual(1);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(60);

    await store.increment(key); // => 2

    // Ensure the hit count is 1, and the expiry is 60 milliseconds (value of
    // `windowMs`).
    expect(Number(await client.get("rl:test-store"))).toEqual(2);
    expect(Number(await client.pttl("rl:test-store"))).toEqual(60);
  });

  describe("reset time", () => {
    beforeEach(() => Jest.useFakeTimers("modern"));
    afterEach(() => Jest.useRealTimers());

    it("resets the count for all the keys in the store when the timeout is reached", async () => {
      const client = new MockRedisClient();
      const store = new RedisStore({
        sendCommand: async (...args: string[]) => sendCommand(client, args),
      });
      store.init({ windowMs: 50 } as Options);

      const keyOne = "test-store-one";
      const keyTwo = "test-store-two";

      await store.increment(keyOne);
      await store.increment(keyTwo);

      Jest.advanceTimersByTime(60);

      // Ensure that the keys have been deleted
      expect(await client.get("rl:test-store-one")).toEqual(null);
      expect(await client.get("rl:test-store-two")).toEqual(null);
    });
  });
});
