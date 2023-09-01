// /source/lib.ts
// The redis store code.

import {
	Store,
	IncrementResponse,
	Options as RateLimitConfiguration,
} from 'express-rate-limit'

import { Options, SendCommandFn } from './types.js'

/**
 * A `Store` for the `express-rate-limit` package that stores hit counts in
 * Redis.
 */
class RedisStore implements Store {
	/**
	 * The function used to send raw commands to Redis.
	 */
	sendCommand: SendCommandFn

	/**
	 * The text to prepend to the key in Redis.
	 */
	prefix: string

	/**
	 * Whether to reset the expiry for a particular key whenever its hit count
	 * changes.
	 */
	resetExpiryOnChange: boolean

	/**
	 * Stores the loaded SHA1 of the LUA script for executing the increment operations.
	 */
	loadedScriptSha1: Promise<string>

	/**
	 * The number of milliseconds to remember that user's requests.
	 */
	windowMs!: number

	/**
	 * @constructor for `RedisStore`.
	 *
	 * @param options {Options} - The configuration options for the store.
	 */
	constructor(options: Options) {
		this.sendCommand = options.sendCommand
		this.prefix = options.prefix ?? 'rl:'
		this.resetExpiryOnChange = options.resetExpiryOnChange ?? false

		// So that the script loading can occur non-blocking, this will send
		// the script to be loaded, and will capture the value within the
		// promise return. This way, if increments start being called before
		// the script has finished loading, it will wait until it is loaded
		// before it continues.
		this.loadedScriptSha1 = this.loadScript()
	}

	async loadScript(): Promise<string> {
		const result = await this.sendCommand(
			'SCRIPT',
			'LOAD',
			`
        local totalHits = redis.call("INCR", KEYS[1])
        local timeToExpire = redis.call("PTTL", KEYS[1])
        if timeToExpire <= 0 or ARGV[1] == "1"
        then
            redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[2]))
            timeToExpire = tonumber(ARGV[2])
        end

        return { totalHits, timeToExpire }
    `
				// Ensure that code changes that affect whitespace do not affect
				// the script contents.
				.replace(/^\s+/gm, '')
				.trim(),
		)

		if (typeof result !== 'string') {
			throw new TypeError('unexpected reply from redis client')
		}

		return result
	}

	/**
	 * Method to prefix the keys with the given text.
	 *
	 * @param key {string} - The key.
	 *
	 * @returns {string} - The text + the key.
	 */
	prefixKey(key: string): string {
		return `${this.prefix}${key}`
	}

	/**
	 * Method that actually initializes the store.
	 *
	 * @param options {RateLimitConfiguration} - The options used to setup the middleware.
	 */
	init(options: RateLimitConfiguration) {
		this.windowMs = options.windowMs
	}

	async runCommandWithRetry(key: string) {
		const evalCommand = async () =>
			this.sendCommand(
				'EVALSHA',
				await this.loadedScriptSha1,
				'1',
				this.prefixKey(key),
				this.resetExpiryOnChange ? '1' : '0',
				this.windowMs.toString(),
			)

		try {
			const result = await evalCommand()
			return result
		} catch {
			// TODO: distinguish different error types
			this.loadedScriptSha1 = this.loadScript()
			return evalCommand()
		}
	}

	/**
	 * Method to increment a client's hit counter.
	 *
	 * @param key {string} - The identifier for a client
	 *
	 * @returns {IncrementResponse} - The number of hits and reset time for that client
	 */
	async increment(key: string): Promise<IncrementResponse> {
		const results = await this.runCommandWithRetry(key)

		if (!Array.isArray(results)) {
			throw new TypeError('Expected result to be array of values')
		}

		if (results.length !== 2) {
			throw new Error(`Expected 2 replies, got ${results.length}`)
		}

		const totalHits = results[0]
		if (typeof totalHits !== 'number') {
			throw new TypeError('Expected value to be a number')
		}

		const timeToExpire = results[1]
		if (typeof timeToExpire !== 'number') {
			throw new TypeError('Expected value to be a number')
		}

		const resetTime = new Date(Date.now() + timeToExpire)
		return {
			totalHits,
			resetTime,
		}
	}

	/**
	 * Method to decrement a client's hit counter.
	 *
	 * @param key {string} - The identifier for a client
	 */
	async decrement(key: string): Promise<void> {
		await this.sendCommand('DECR', this.prefixKey(key))
	}

	/**
	 * Method to reset a client's hit counter.
	 *
	 * @param key {string} - The identifier for a client
	 */
	async resetKey(key: string): Promise<void> {
		await this.sendCommand('DEL', this.prefixKey(key))
	}
}

export default RedisStore
