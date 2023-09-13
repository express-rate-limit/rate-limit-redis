// /source/types.ts
// The type definitions for this library.

/**
 * The type of data Redis might return to us.
 */
export type RedisReply = number | string

/**
 * The library sends Redis raw commands, so all we need to know are the
 * 'raw-command-sending' functions for each redis client.
 */
export type SendCommandFn = (
	...args: string[]
) => Promise<RedisReply | RedisReply[]>

/**
 * The configuration options for the store.
 */
export type Options = {
	/**
	 * The function used to send commands to Redis.
	 */
	readonly sendCommand: SendCommandFn

	/**
	 * The text to prepend to the key in Redis.
	 */
	readonly prefix?: string

	/**
	 * Whether to reset the expiry for a particular key whenever its hit count
	 * changes.
	 */
	readonly resetExpiryOnChange?: boolean

	/**
	 * Whether or not to let the request succeed as a failover when a connection
	 * error occurs.
	 */
	readonly passOnConnectionError?: boolean
}
