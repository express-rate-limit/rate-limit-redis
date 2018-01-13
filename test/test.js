/*global describe, it */
var RedisStore = require('../lib/redis-store.js');

describe("rate-limit-redis node module", function() {

  var MockRedisClient = function() {
    var keys = {};

    this.multi = function() {
      var opts = [];

      this.incr = function(key) {
        opts.push(function() {
          if (keys[key]) {
            keys[key].value++;
          } else {
            keys[key] = { value: 1 };
          }

          return keys[key].value;
        });

        return this;
      };

      this.decr = function(key) {
        opts.push(function() {
          if (keys[key]) {
            keys[key].value--;
          } else {
            keys[key] = { value: 0 };
          }

          return keys[key].value;
        });

        return this;
      };

      this.pttl = function(key) {
        opts.push(function() {
          if (keys[key] && keys[key].ttl) {
            return Math.max(keys[key].ttl - new Date().valueOf(), -1);
          }

          return -1;
        });

        return this;
      };

      this.exec = function(cb) {
        cb(null, opts.map(function(opt) {
          return opt();
        }));
      };

      return this;
    };

    this.pexpire = function(key, expiry) {
      if (keys[key]) {
        if (keys[key].timeout) {
          clearTimeout(keys[key].timeout);
        }

        keys[key].pttl = new Date() + expiry;

        keys[key].timeout = setTimeout(function() {
          delete keys[key];
        }, keys[key].pttl - new Date().getTime());
      }
    };

    this.del = function(key) {
      delete keys[key];
    };
  };

  it("can be created without error", function(done) {
    try {
      new RedisStore({
        client: new MockRedisClient()
      });
    } catch (e) {
      return done(e);
    }

    done();
  });

  it("sets the value to 1 on first incr", function(done) {
    var store = new RedisStore({
      client: new MockRedisClient()
    });
    var key = "test-store-incr-first";

    store.incr(key, function(err, value) {
      if (err) {
        done(err);
      } else {
        if (value === 1) {
          done();
        } else {
          done(new Error("incr did not set the key on the store to 1, was set to " + value));
        }
      }
    });
  });

  it("increments the key for the store each incr", function(done) {
    var store = new RedisStore({
      client: new MockRedisClient()
    });
    var key = "test-store-incr";

    store.incr(key, function() {
      store.incr(key, function(err, value) {
        if (err) {
          done(err);
        } else {
          if (value === 2) {
            done();
          } else {
            done(new Error("incr did not increment the store"));
          }
        }
      });
    });
  });

  it("decrements the key for the store each decrement", function(done) {
    var store = new RedisStore({
      client: new MockRedisClient()
    });
    var key = "test-store-decrement";

    store.incr(key, function() {
      store.decrement(key);
      store.incr(key, function(err, value) {
        if (err) {
          done(err);
        } else {
          if (value === 1) {
            done();
          } else {
            done(new Error("decrement did not decrement the store"));
          }
        }
      });
    });
  });

  it("resets the key for the store when used with resetKey", function(done) {
    var store = new RedisStore({
      client: new MockRedisClient()
    });
    var key = "test-store-resetKey";

    store.incr(key, function() {
      // value should be 1 now
      store.resetKey(key);
      // value should be 0 now
      store.incr(key, function(err, value) {
        // value should be 1 now
        if (value === 1) {
          done();
        } else {
          done(new Error("resetKey did not reset the store for the key provided"));
        }
      });
    });
  });

  it("resets key for the store when the timeout is reached", function(done) {
    var store = new RedisStore({
      client: new MockRedisClient(),
      expiry: 1
    });
    var key = "test-store-timeout";

    store.incr(key, function() {
      // valueOne should be 1 now
      setTimeout(function() {
        // valueOne and valueTwo should be 0 now
        store.incr(key, function(err, value) {
          // valueOne should be 1 now
          if (value === 1) {
            done();
          } else {
            done(new Error("reaching the timeout did not reset the key in the store"));
          }
        });
      }, 1500);
    });
  });
});
