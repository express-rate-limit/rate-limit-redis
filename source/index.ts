import RedisStore from "./lib.js";

// Re-export all type definitions
export * from "./types.js";

// Export the RedisStore class as the default export
// https://github.com/timocov/dts-bundle-generator/issues/182
// eslint-disable-next-line unicorn/prefer-export-from
export default RedisStore;
