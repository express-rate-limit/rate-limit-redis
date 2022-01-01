// ~/source/types.ts
// The types for the library

/**
 * The library sends Redis raw commands, so all we need to know are the
 * 'raw-command-sending' functions for each redis client.
 */
export type SendCommandFn = (...args: string[]) => Promise<number> | number

/**
 * The configuration options for the store.
 */
export interface Options {
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
}
