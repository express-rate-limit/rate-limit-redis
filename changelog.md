# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/wyattjoh/rate-limit-redis/tree/main)

### Added

- Added issue and PR templates.
- The `release` action now publishes a GitHub release when a new tag is pushed
  with a built `.tgz` file so you can install the package from npm and GitHub.
- [BREAKING] Added the `sendCommand` option to replace the `client` option
  - `sendCommand` is a function that takes the raw command as a string array and
    returns the numeric response from redis.
  - this makes the store compatible with all clients that have a public method
    to send raw commands to redis.
- Added a changelog and a contributing guide.

### Changed

- Rewrote library and tests in Typescript.
- Use `esbuild` to build both ES and CommonJS modules and use
  `dts-bundle-generator` to generate a single type declaration file.
- Added `express` >= 4 and `express-rate-limit` >= 6 as peer dependencies.

### Removed

- [BREAKING] Removed the `expiry` option, as we now get that from the rate
  limiting middleware in the `init` method.
- [BREAKING] Removed the `client` option, as it is now replaced by the
  `sendCommand` option
- [BREAKING] Removed the `passIfNotConnected` option, as developers now need to
  handle connection using a client of their choice

## [v2.1.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v2.1.0)

### Added

- Added the `passIfNotConnected` option.
  - If set to `true`, if the client is not connected to Redis, the store will
    allow the request to pass through as a failover.

### Removed

- Dropped support for Node 6.

## [v2.0.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v2.0.0)

### Changed

- [BREAKING] Bumped `node-redis` version from `2.8.0` to `3.0.2`.

## [v1.7.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.7.0)

### Added

- Added support for passing a redis connection string instead of a client
  instance to the constructor.

## [v1.6.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.6.0)

### Added

- Added example of connecting to a UDP socket to the readme.
- Added support for returning the reset date to the rate limit middleware.

## [v1.5.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.5.0)

### Added

- Added the `resetExpiryOnChange` option.
  - If set to `true`, the store sets the expiry time back to `windowMs` when
    incrementing/decrementing. This aligns better with how the default handler
    in the rate limiting middleware displays the time in the `Retry-After`
    header.

## [v1.4.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.4.0)

### Added

- Added support for the `decrement` and `reset` functions (see
  https://github.com/nfriedly/express-rate-limit/commit/c9194780b6826d9cdb14b3395907cf7fb93e59f6)

## [v1.3.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.3.0)

### Added

- Added support for millisecond precision in the `expiry` option.

## [v1.1.0](https://github.com/wyattjoh/rate-limit-redis/releases/tag/v1.1.0)

### Added

- Added better support for IORedis.
