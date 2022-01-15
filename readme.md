# <div align="center"> `rate-limit-redis` </div>

<div align="center">
	<img alt="Github Workflow Status" src="https://img.shields.io/github/workflow/status/wyattjoh/rate-limit-redis/CI"/>
	<img alt="npm version" src="https://img.shields.io/npm/v/rate-limit-redis.svg"/>
	<img alt="GitHub Stars" src="https://img.shields.io/github/stars/wyattjoh/rate-limit-redis"/>
	<img alt="npm downloads" src="https://img.shields.io/npm/dm/rate-limit-redis"/>
</div>

<br>

<div align="center">

A [`redis`](https://github.com/redis/redis) store for the
[`express-rate-limit`](https://github.com/nfriedly/express-rate-limit)
middleware.

</div>

## Installation

From the npm registry:

```sh
# Using npm
> npm install rate-limit-redis
# Using yarn or pnpm
> yarn/pnpm add rate-limit-redis
```

From Github Releases:

```sh
# Using npm
> npm install https://github.com/wyattjoh/rate-limit-redis/releases/download/v{version}/rate-limit-redis.tgz
# Using yarn or pnpm
> yarn/pnpm add https://github.com/wyattjoh/rate-limit-redis/releases/download/v{version}/rate-limit-redis.tgz
```

Replace `{version}` with the version of the package that you want to your, e.g.:
`3.0.0`.

## Usage

### Importing

This library is provided in ESM as well as CJS forms, and works with both
Javascript and Typescript projects.

**This package requires you to use Node 14 or above.**

Import it in a CommonJS project (`type: commonjs` or no `type` field in
`package.json`) as follows:

```ts
const RedisStore = require("rate-limit-redis");
```

Import it in a ESM project (`type: module` in `package.json`) as follows:

```ts
import RedisStore from "rate-limit-redis";
```

### Examples

To use it with a [`node-redis`](https://github.com/redis/node-redis) client:

```ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient } from "redis";

// Create a `node-redis` client
const client = createClient({
  // ... (see https://github.com/redis/node-redis/blob/master/docs/client-configuration.md)
});
// Then connect to the Redis server
await client.connect();

// Create and use the rate limiter
const limiter = rateLimit({
  // Rate limiter configuration
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Redis store configuration
  store: new RedisStore({
    sendCommand: (...args: string[]) => client.sendCommand(args),
  }),
});
app.use(limiter);
```

To use it with a [`ioredis`](https://github.com/luin/ioredis) client:

```ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import RedisClient from "ioredis";

// Create a `ioredis` client
const client = new RedisClient();
// ... (see https://github.com/luin/ioredis#connect-to-redis)

// Create and use the rate limiter
const limiter = rateLimit({
  // Rate limiter configuration
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Redis store configuration
  store: new RedisStore({
    // @ts-expect-error - Known issue: the `call` function is not present in @types/ioredis
    sendCommand: (...args: string[]) => client.call(args),
  }),
});
app.use(limiter);
```

### Configuration

#### `sendCommand`

The function used to send commands to Redis. The function signature is as
follows:

```ts
(...args: string[]) => Promise<number> | number
```

The raw command sending function varies from library to library; some are given
below:

| Library                                                            | Function                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [`node-redis`](https://github.com/redis/node-redis)                | `async (...args: string[]) => client.sendCommand(args)`           |
| [`ioredis`](https://github.com/luin/ioredis)                       | `async (...args: string[]) => client.call(...args)`               |
| [`handy-redis`](https://github.com/mmkal/handy-redis)              | `async (...args: string[]) => client.nodeRedis.sendCommand(args)` |
| [`tedis`](https://github.com/silkjs/tedis)                         | `async (...args: string[]) => client.command(...args)`            |
| [`redis-fast-driver`](https://github.com/h0x91b/redis-fast-driver) | `async (...args: string[]) => client.rawCallAsync(args)`          |
| [`yoredis`](https://github.com/djanowski/yoredis)                  | `async (...args: string[]) => (await client.callMany([args]))[0]` |
| [`noderis`](https://github.com/wallneradam/noderis)                | `async (...args: string[]) => client.callRedis(...args)`          |

#### `prefix`

The text to prepend to the key in Redis.

Defaults to `rl:`.

#### `resetExpiryOnChange`

Whether to reset the expiry for a particular key whenever its hit count changes.

Defaults to `false`.

## License

MIT © [Wyatt Johnson](https://github.com/wyattjoh)
