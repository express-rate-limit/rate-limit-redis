// /test/store-test.ts
// The tests for the store.

import { createHash } from 'node:crypto'
import { expect, jest } from '@jest/globals'
import { type Options } from 'express-rate-limit'
import MockRedisClient from 'ioredis-mock'
import DefaultExportRedisStore, {
	RedisStore,
	type RedisReply,
} from '../source/index.js'

// The mock redis client to use.
const client = new MockRedisClient()

/**
 * A wrapper around the mock redis client to call the right function, as the
 * `ioredis-mock` library does not have a send-raw-command function.
 *
 * @param {string[]} ...args - The raw command to send.
 *
 * @return {RedisReply} The reply returned by Redis.
 */
const sendCommand = async (...args: string[]): Promise<RedisReply> => {
	// `SCRIPT LOAD`, called when the store is initialized. This loads the lua script
	// for incrementing a client's hit counter.
	if (args[0] === 'SCRIPT') {
		// `ioredis-mock` doesn't have a `SCRIPT LOAD` function, so we have to compute
		// the SHA manually and `EVAL` the script to get it saved.
		const shasum = createHash('sha1')
		shasum.update(args[2])
		const sha = shasum.digest('hex')

		const testArgs = args[2].includes('INCR')
			? ['__test_incr', '0', '10']
			: ['__test_get']
		await client.eval(args[2], 1, ...testArgs)

		// Return the SHA to the store.
		return sha
	}

	// `EVALSHA` executes the script that was loaded already with the given arguments
	if (args[0] === 'EVALSHA') {
		// @ts-expect-error Wrong types :/
		return client.evalsha(...args.slice(1)) as number[]
	}

	// `DECR` decrements the count for a client.
	if (args[0] === 'DECR') return client.decr(args[1])
	// `DEL` resets the count for a client by deleting the key.
	if (args[0] === 'DEL') return client.del(args[1])

	// This should not happen
	return -99
}

describe('redis store test', () => {
	// Mock timers so we can fast forward time instead of waiting for n seconds
	beforeEach(() => jest.useFakeTimers())
	afterEach(async () => {
		jest.useRealTimers()
		await client.flushall()
	})

	it('supports custom prefixes', async () => {
		const store = new RedisStore({ sendCommand, prefix: 'test-' })
		store.init({ windowMs: 10 } as Options)

		const key = 'store'

		await store.increment(key)

		// Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(Number(await client.get('test-store'))).toEqual(1)
		expect(Number(await client.pttl('test-store'))).toEqual(10)
	})

	it('sets the value to 1 on first call to `increment`', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		const { totalHits } = await store.increment(key) // => 1

		// Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(totalHits).toEqual(1)
		expect(Number(await client.get('rl:test-store'))).toEqual(1)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(10)
	})

	it('increments the key for the store when `increment` is called', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		await store.increment(key) // => 1
		const { totalHits } = await store.increment(key) // => 2

		// Ensure the hit count is 2, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(totalHits).toEqual(2)
		expect(Number(await client.get('rl:test-store'))).toEqual(2)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(10)
	})

	it('decrements the key for the store when `decrement` is called', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		await store.increment(key) // => 1
		await store.increment(key) // => 2
		await store.decrement(key) // => 1
		const { totalHits } = await store.increment(key) // => 2

		// Ensure the hit count is 2, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(totalHits).toEqual(2)
		expect(Number(await client.get('rl:test-store'))).toEqual(2)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(10)
	})

	it('resets the count for a key in the store when `resetKey` is called', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		await store.increment(key) // => 1
		await store.increment(key) // => 2
		await store.resetKey(key) // => undefined

		const { totalHits } = await store.increment(key) // => 1

		// Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(totalHits).toEqual(1)
		expect(Number(await client.get('rl:test-store'))).toEqual(1)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(10)
	})

	it('fetches the count for a key in the store when `getKey` is called', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		await store.increment(key) // => 1
		await store.increment(key) // => 2
		const info = await store.get(key)

		// Ensure the hit count is 1, and that `resetTime` is a date.
		expect(info).toMatchObject({
			totalHits: 2,
			resetTime: expect.any(Date),
		})
	})

	it('resets expiry time on change if `resetExpiryOnChange` is set to `true`', async () => {
		const store = new RedisStore({ sendCommand, resetExpiryOnChange: true })
		store.init({ windowMs: 60 } as Options)

		const key = 'test-store'

		await store.increment(key) // => 1

		// Ensure the hit count is 1, and the expiry is 60 milliseconds (value of
		// `windowMs`).
		expect(Number(await client.get('rl:test-store'))).toEqual(1)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(60)

		await store.increment(key) // => 2

		// Ensure the hit count is 2, and the expiry is 60 milliseconds (value of
		// `windowMs`).
		expect(Number(await client.get('rl:test-store'))).toEqual(2)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(60)
	})

	it('resets the count for all the keys in the store when the timeout is reached', async () => {
		const store = new RedisStore({ sendCommand })
		store.init({ windowMs: 50 } as Options)

		const keyOne = 'test-store-one'
		const keyTwo = 'test-store-two'

		await store.increment(keyOne)
		await store.increment(keyTwo)

		jest.advanceTimersByTime(60)

		// Ensure that the keys have been deleted
		expect(await client.get('rl:test-store-one')).toEqual(null)
		expect(await client.get('rl:test-store-two')).toEqual(null)
	})

	it('starts new window with count 1 when TTL expired (race fix)', async () => {
		const store = new RedisStore({ sendCommand })
		const windowMs = 50
		store.init({ windowMs } as Options)

		const key = 'test-expired-window'

		// First hit in first window
		const first = await store.increment(key)
		expect(first.totalHits).toEqual(1)
		expect(Number(await client.pttl(`rl:${key}`))).toEqual(windowMs)

		// Advance beyond expiry so Redis reports expired (-2)
		jest.advanceTimersByTime(windowMs + 1)

		// Next increment should start a fresh window with count=1 and TTL reset
		const afterExpiry = await store.increment(key)
		expect(afterExpiry.totalHits).toEqual(1)
		expect(Number(await client.get(`rl:${key}`))).toEqual(1)
		expect(Number(await client.pttl(`rl:${key}`))).toEqual(windowMs)
	})

	it.skip('do not reset the expiration when the ttl is very close to 0', async () => {
		const store = new RedisStore({ sendCommand })
		const windowMs = 60
		store.init({ windowMs } as Options)

		const key = 'test-store'
		await store.increment(key)

		// FIXME: This makes the mock client return ttl = 1, not 0. So does setting
		// the ttl via client.pexpire to 1. Setting the ttl to 0 makes it expire
		// instantly, so the ttl returned is -2. If you can figure out a way to
		// consistently reproduce the close-to-0 behaviour with the mock client,
		// replace the advanceTimersByTime call with it.
		jest.advanceTimersByTime(59)
		await store.increment(key)

		// Ensure the hit count is 2, and the expiry is not reset
		expect(Number(await client.pttl('rl:test-store'))).not.toEqual(windowMs)
		expect(Number(await client.pttl('rl:test-store'))).toBeLessThanOrEqual(0)
		expect(Number(await client.get('rl:test-store'))).toEqual(2)
	})

	it('default export works', async () => {
		const store = new DefaultExportRedisStore({ sendCommand })
		store.init({ windowMs: 10 } as Options)

		const key = 'test-store'

		const { totalHits } = await store.increment(key) // => 1

		// Ensure the hit count is 1, and the expiry is 10 milliseconds (value of
		// `windowMs`).
		expect(totalHits).toEqual(1)
		expect(Number(await client.get('rl:test-store'))).toEqual(1)
		expect(Number(await client.pttl('rl:test-store'))).toEqual(10)
	})

	it('unit: when PTTL==0 but key exists, script starts new window with 1', async () => {
		// In-memory fake Redis state for a single key
		const state: { value: number; ttl: number } = { value: 0, ttl: -2 }
		let loadedIncrementScript = ''

		// Stub that simulates Redis primitives and applies logic depending on script order
		const sendCommandStub = async (...args: string[]): Promise<RedisReply> => {
			const [command, ...rest] = args
			if (command === 'SCRIPT' && rest[0] === 'LOAD') {
				const scriptBody = rest[1]
				if (scriptBody.includes('INCR')) loadedIncrementScript = scriptBody
				// Return a fake sha
				return 'sha-' + (scriptBody.includes('INCR') ? 'incr' : 'get')
			}

			if (command === 'EVALSHA') {
				const sha = rest[0]
				const numberKeys = rest[1]
				const key = rest[2]
				const resetOnChange = rest[3] === '1'
				const windowMs = Number(rest[4])
				if (sha.endsWith('incr') && numberKeys === '1' && key) {
					// Determine algorithm: does the script read PTTL before INCR?
					const pttlIndex = loadedIncrementScript.indexOf('PTTL')
					const incrIndex = loadedIncrementScript.indexOf('INCR')

					let totalHits = 0
					let { ttl } = state

					if (pttlIndex > -1 && incrIndex > -1 && pttlIndex < incrIndex) {
						// NEW script: check ttl first
						if (ttl <= 0) {
							state.value = 1
							state.ttl = windowMs
							totalHits = 1
							ttl = windowMs
						} else {
							state.value += 1
							totalHits = state.value
							if (resetOnChange) state.ttl = windowMs
							ttl = state.ttl
						}
					} else {
						// OLD script: INCR first, then PTTL; only resets when ttl<0
						state.value += 1
						totalHits = state.value
						// Read pttl after incr; here ttl is 0 (exists but expired)
						if (ttl < 0 || resetOnChange) {
							state.ttl = windowMs
							ttl = windowMs
						} else {
							// Ttl == 0 branch
							ttl = 0
						}
					}

					return [totalHits as unknown as number, ttl as unknown as number]
				}
			}

			// Fallback for get script
			if (command === 'EVALSHA' && args[0].endsWith('get')) {
				return [
					state.value as unknown as number,
					state.ttl as unknown as number,
				]
			}

			return -99
		}

		const store = new RedisStore({ sendCommand: sendCommandStub })
		store.init({ windowMs: 60 } as Options)

		const key = 'pttl-zero-exists'

		// First increment to create key with value=1 and ttl=60
		await store.increment(key)
		state.value = 1
		state.ttl = 0 // Simulate edge: key still exists but PTTL==0 exactly

		const result = await store.increment(key)

		// With NEW script we expect a fresh window: hits=1 and ttl reset
		expect(result.totalHits).toEqual(1)
	})
})
