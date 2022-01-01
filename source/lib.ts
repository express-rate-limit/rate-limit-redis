// ~/source/lib.ts
// The Redis `Store` for the `express-rate-limit` library

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

	/**
	 * Method to increment a client's hit counter.
	 *
	 * @param key {string} - The identifier for a client
	 *
	 * @returns {IncrementResponse} - The number of hits and reset time for that client
	 */
	async increment(key: string): Promise<IncrementResponse> {
		const totalHits = await this.sendCommand('INCR', this.prefixKey(key))

		let timeToExpire = await this.sendCommand('PTTL', this.prefixKey(key))
		if (timeToExpire <= 0 || this.resetExpiryOnChange) {
			await this.sendCommand(
				'PEXPIRE',
				this.prefixKey(key),
				this.windowMs.toString(),
			)
			timeToExpire = this.windowMs
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
