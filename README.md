# Rate Limit Redis

[![Build Status](https://secure.travis-ci.org/wyattjoh/rate-limit-redis.png?branch=master)](http://travis-ci.org/wyattjoh/rate-limit-redis)
[![NPM version](http://badge.fury.io/js/rate-limit-redis.png)](https://npmjs.org/package/rate-limit-redis "View this project on NPM")
[![Dependency Status](https://david-dm.org/wyattjoh/rate-limit-redis.png?theme=shields.io)](https://david-dm.org/wyattjoh/rate-limit-redis)
[![Development Dependency Status](https://david-dm.org/wyattjoh/rate-limit-redis/dev-status.png?theme=shields.io)](https://david-dm.org/wyattjoh/rate-limit-redis#info=devDependencies)

Redis client for the [express-rate-limit](https://github.com/nfriedly/express-rate-limit) middleware.

## Install

```sh
$ npm install --save rate-limit-redis
```

## Usage

```js
const RateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const limiter = new RateLimit({
  store: new RedisStore({
    // see Configuration
  }),
  max: 100, // limit each IP to 100 requests per windowMs
  delayMs: 0 // disable delaying - full speed until the max limit is reached
});

//  apply to all requests
app.use(limiter);
```

## Connect to UDP Socket

```js
const RateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const client = new Redis('/tmp/redis.sock');

const limiter = new RateLimit({
  store: new RedisStore({
    client: client
  }),
  max: 100, // limit each IP to 100 requests per windowMs
  delayMs: 0 // disable delaying - full speed until the max limit is reached
});
```

## Configuration

- **expiry**: seconds - how long each rate limiting window exists for. Defaults to `60`.
- **resetExpiryOnChange**: boolean - if the expiry time should be reset every time a key is incremented/decremented. This means that when the limit is reached and the user is given a 429 response, the rate limit window is extended. Defaults to `false`.
- **prefix**: string - prefix to add to entries in Redis. Defaults to `rl:`.
- **client**: [Redis Client](https://github.com/NodeRedis/node_redis) or [ioredis Client](https://github.com/luin/ioredis)- A Redis Client to use. Defaults to `require('redis').createClient();`.
- **redisURL**: string - a Redis connection string to be used for the default client connection. Ignored when the `client` option is provided. [Redis Client connection string format and options](https://github.com/NodeRedis/node_redis#rediscreateclient).

## License

MIT © [Wyatt Johnson](https://wyattjoh.ca/), [Nathan Friedly](http://nfriedly.com/)
