// /source/lib.ts
// The redis store code.

import type {
	Store,
	IncrementResponse,
	Options as RateLimitConfiguration,
} from 'express-rate-limit'
import type { Options, SendCommandFn, RedisReply } from './types.js'

// eslint-disable-next-line @typescript-eslint/naming-convention
const FAILOVER = Symbol('rate-limit-redis:failover')

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
	 * Whether or not to let the request succeed as a failover when a connection
	 * error occurs.
	 */
	passOnConnectionError: boolean

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
		this.passOnConnectionError = options.passOnConnectionError ?? false

		// So that the script loading can occur non-blocking, this will send
		// the script to be loaded, and will capture the value within the
		// promise return. This way, if increments start being called before
		// the script has finished loading, it will wait until it is loaded
		// before it continues.
		this.loadedScriptSha1 = this.loadScript()
	}

	/**
	 * Sends the script to redis, so that we can execute it when the `increment`
	 * method is called.
	 *
	 * @returns {string} - The SHA1 of the script, used to call it later.
	 */
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
				.replaceAll(/^\s+/gm, '')
				.trim(),
		)

		if (typeof result !== 'string')
			throw new TypeError('Expected result to be the script SHA')

		return result
	}

	/**
	 * Calls the `EVALSHA` command with the correct arguments for the script.
	 */
	async executeScript(
		key: string,
	): Promise<RedisReply | RedisReply[] | typeof FAILOVER> {
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
		} catch (caughtError: any) {
			const error = caughtError as Error

			// If the redis server was restarted, the script will no longer be in
			// memory. Call the `loadScript` function again to ensure it is, and then
			// retry calling the script.
			if (error.message?.startsWith('NOSCRIPT')) {
				this.loadedScriptSha1 = this.loadScript()
				return evalCommand()
			}

			// If we don't want to retry the command upon a connection error, return the
			// special `FAILOVER` symbol.
			if (this.passOnConnectionError) {
				console.warn(
					'A request was allowed to pass through as a failover, since the following error occurred:\n  ',
					error?.message ?? error,
				)

				return FAILOVER
			}

			// Try calling the script again, only if we are not supposed to passover.
			return evalCommand()
		}
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
		// Call the `EVALSHA` command, and retry it once in case an error occurs.
		const results = await this.executeScript(key)

		// If a connection error occurred, and the `passOnConnectionError` option
		// is enabled, let the request pass through.
		if (results === FAILOVER)
			return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) }

		// Otherwise, validate the response and return the actual hit count and
		// reset time.
		if (!Array.isArray(results))
			throw new TypeError('Expected result to be array of values')
		if (results.length !== 2)
			throw new Error(`Expected 2 replies, got ${results.length}`)

		const totalHits = results[0]
		if (typeof totalHits !== 'number')
			throw new TypeError('Expected value to be a number')

		const timeToExpire = results[1]
		if (typeof timeToExpire !== 'number')
			throw new TypeError('Expected value to be a number')

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
