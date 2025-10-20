// /source/scripts.ts
// The lua scripts for the increment and get operations.

/**
 * The lua scripts, used to make consecutive queries on the same key and avoid
 * race conditions by doing all the work on the redis server.
 */
const scripts = {
	increment: `
	      local windowMs = tonumber(ARGV[2])
	      local resetOnChange = ARGV[1] == "1"

	      local timeToExpire = redis.call("PTTL", KEYS[1])

	      if timeToExpire <= 0 then
	        redis.call("SET", KEYS[1], 1, "PX", windowMs)
	        return { 1, windowMs }
	      end

	      local totalHits = redis.call("INCR", KEYS[1])

	      if resetOnChange then
	        redis.call("PEXPIRE", KEYS[1], windowMs)
	        timeToExpire = windowMs
	      end
        
	      return { totalHits, timeToExpire }
		`
		// Ensure that code changes that affect whitespace do not affect
		// the script contents.
		.replaceAll(/^\s+/gm, '')
		.trim(),
	get: `
      local totalHits = redis.call("GET", KEYS[1])
      local timeToExpire = redis.call("PTTL", KEYS[1])

      return { totalHits, timeToExpire }
		`
		.replaceAll(/^\s+/gm, '')
		.trim(),
}

// Export them so we can use them in the `lib.ts` file.
export default scripts
