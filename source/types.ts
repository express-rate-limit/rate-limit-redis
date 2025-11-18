// /source/types.ts
// The type definitions for this library.

/**
 * The type of data Redis might return to us.
 */
type Data = boolean | number | string
export type RedisReply = Data | Data[]

/**
 * The library sends Redis raw commands, so all we need to know are the
 * 'raw-command-sending' functions for each redis client.
 */
export type SendCommandFn = (...args: string[]) => Promise<RedisReply>

export type SendCommandClusterDetails = {
	key?: string
	isReadOnly: boolean
	command: string[]
}

/**
 * This alternative to SendCommandFn includes a little bit of extra data that node-redis requires, to help route the command to the correct server.
 */
export type SendCommandClusterFn = (
	commandDetails: SendCommandClusterDetails,
) => Promise<RedisReply>

type CommonOptions = {
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

type SingleOptions = CommonOptions & {
	/**
	 * The function used to send commands to Redis.
	 */
	readonly sendCommand: SendCommandFn
}

type ClusterOptions = CommonOptions & {
	/**
	 * The alternative function used to send commands to Redis when in cluster mode.
	 * (It provides extra parameters to help route the command to the correct redis node.)
	 */
	readonly sendCommandCluster: SendCommandClusterFn
}

/**
 * The configuration options for the store.
 */
export type Options = SingleOptions | ClusterOptions
