import process from 'node:process'
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import { Redis, Cluster } from 'ioredis'
import { type Options as RateLimitOptions } from 'express-rate-limit'
import { RedisStore } from '../source/index.js'
import type {
	SendCommandClusterDetails,
	RedisReply,
	Options as RedisOptions,
} from '../source/types.js'

jest.setTimeout(30_000)

describe('Redis Integration Tests', () => {
	describe('Single Redis Instance', () => {
		let client: Redis
		let store: RedisStore

		beforeAll(async () => {
			const host = process.env.REDIS_HOST ?? 'localhost'
			const port = Number(process.env.REDIS_PORT ?? 6385)

			client = new Redis({
				host,
				port,
				lazyConnect: true,
			})
			await client.connect().catch(() => {
				console.warn('Skipping Redis tests - connection failed')
			})
		})

		afterAll(async () => {
			await client?.quit()
		})

		it('should work with sendCommand', async () => {
			if (client.status !== 'ready') {
				console.warn('Redis not ready, skipping test')
				return
			}

			store = new RedisStore({
				async sendCommand(...args: string[]) {
					const result = await client.call(args[0], ...args.slice(1))
					return result as RedisReply
				},
			} as RedisOptions)
			store.init({ windowMs: 1000 } as RateLimitOptions)

			const key = 'test-single'
			await store.resetKey(key)

			const result1 = await store.increment(key)
			expect(result1.totalHits).toBe(1)

			const result2 = await store.increment(key)
			expect(result2.totalHits).toBe(2)

			await store.resetKey(key)
			const result3 = await store.increment(key)
			expect(result3.totalHits).toBe(1)
		})

		it('should work with decrement', async () => {
			if (client.status !== 'ready') return

			const key = 'test-single-decr'
			await store.resetKey(key)

			await store.increment(key) // 1
			await store.increment(key) // 2
			await store.decrement(key) // 1

			const result = await store.increment(key) // 2
			expect(result.totalHits).toBe(2)
		})

		it('should work with get', async () => {
			if (client.status !== 'ready') return

			const key = 'test-single-get'
			await store.resetKey(key)

			await store.increment(key)
			const info = await store.get(key)
			expect(info).toBeDefined()
			expect(info?.totalHits).toBe(1)
			expect(info?.resetTime).toBeInstanceOf(Date)
		})

		it('should handle TTL correctly', async () => {
			if (client.status !== 'ready') return

			const key = 'test-single-ttl'
			// Initialize with short window
			const shortStore = new RedisStore({
				async sendCommand(...args: string[]) {
					const result = await client.call(args[0], ...args.slice(1))
					return result as RedisReply
				},
			} as RedisOptions)
			shortStore.init({ windowMs: 1000 } as RateLimitOptions)

			await shortStore.resetKey(key)
			await shortStore.increment(key)

			// Wait for expiration (1.1s)
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 1100)
			})

			const result = await shortStore.increment(key)
			expect(result.totalHits).toBe(1)
		})
	})

	describe('Redis Cluster', () => {
		let client: Cluster
		let store: RedisStore

		beforeAll(async () => {
			const host = process.env.REDIS_CLUSTER_HOST ?? 'localhost'
			const port = Number(process.env.REDIS_CLUSTER_PORT ?? 7010)

			client = new Cluster([{ host, port }], {
				redisOptions: { connectTimeout: 2000 },
				clusterRetryStrategy: () => null,
				lazyConnect: true,
			})
			try {
				await client.connect()
			} catch {
				console.warn('Skipping Redis Cluster tests - connection failed')
			}
		})

		afterAll(async () => {
			await client?.quit()
		})

		it('should work with sendCommandCluster', async () => {
			if (client.status !== 'ready') {
				console.warn('Redis Cluster not ready, skipping test')
				return
			}

			store = new RedisStore({
				async sendCommandCluster(details: SendCommandClusterDetails) {
					const { command } = details
					const result = await client.call(command[0], ...command.slice(1))
					return result as RedisReply
				},
			} as RedisOptions)
			store.init({ windowMs: 1000 } as RateLimitOptions)

			const key = 'test-cluster'
			await store.resetKey(key)

			const result1 = await store.increment(key)
			expect(result1.totalHits).toBe(1)

			const result2 = await store.increment(key)
			expect(result2.totalHits).toBe(2)

			await store.resetKey(key)
			const result3 = await store.increment(key)
			expect(result3.totalHits).toBe(1)
		})

		it('should work with decrement', async () => {
			if (client.status !== 'ready') return

			const key = 'test-cluster-decr'
			await store.resetKey(key)

			await store.increment(key) // 1
			await store.increment(key) // 2
			await store.decrement(key) // 1

			const result = await store.increment(key) // 2
			expect(result.totalHits).toBe(2)
		})

		it('should work with get', async () => {
			if (client.status !== 'ready') return

			const key = 'test-cluster-get'
			await store.resetKey(key)

			await store.increment(key)
			const info = await store.get(key)
			expect(info).toBeDefined()
			expect(info?.totalHits).toBe(1)
			expect(info?.resetTime).toBeInstanceOf(Date)
		})

		it('should handle TTL correctly', async () => {
			if (client.status !== 'ready') return

			const key = 'test-cluster-ttl'
			// Initialize with short window
			const shortStore = new RedisStore({
				async sendCommandCluster(details: SendCommandClusterDetails) {
					const { command } = details
					const result = await client.call(command[0], ...command.slice(1))
					return result as RedisReply
				},
			} as RedisOptions)
			shortStore.init({ windowMs: 1000 } as RateLimitOptions)

			await shortStore.resetKey(key)
			await shortStore.increment(key)

			// Wait for expiration (1.1s)
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 1100)
			})

			const result = await shortStore.increment(key)
			expect(result.totalHits).toBe(1)
		})
	})
})
