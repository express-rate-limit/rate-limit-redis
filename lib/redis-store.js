'use strict';
var defaults = require('defaults');
var redis = require('redis');

var RedisStore = function(options) {
  options = defaults(options, {
    expiry: 60, // default expiry is one minute
    prefix: "rl:",
    resetExpiryOnChange: false
  });

  var expiryMs = Math.round(1000 * options.expiry);

  // create the client if one isn't provided
  options.client = options.client || redis.createClient();

  var setExpire = function(replies, rdskey) {
    // if this is new or has no expiry
    if (options.resetExpiryOnChange || replies[0] === 1 || replies[1] === -1) {
      // then expire it after the timeout
      options.client.pexpire(rdskey, expiryMs);
      return expiryMs;
    } else {
      return replies[1];
    }
  };

  var processReplies = function(replies) {
    // in ioredis, every reply consists of an array [err, value].
    // We don't need the error here, and if we aren't dealing with an array,
    // nothing is changed.
    return replies.map(function(val) {
      if (Array.isArray(val) && val.length >= 2) {
        return val[1];
      }

      return val;
    });
  };

  this.incr = function(key, cb) {
    var rdskey = options.prefix + key;

    options.client.multi()
      .incr(rdskey)
      .pttl(rdskey)
      .exec(function(err, replies) {
        if (err) {
          return cb(err);
        }

        replies = processReplies(replies);
        var ttl = setExpire(replies, rdskey);

        cb(null, replies[0], ttl > 0 ? new Date(new Date().getTime() + ttl) : null);
      });
  };

  this.decrement = function(key) {
    var rdskey = options.prefix + key;

    options.client.multi()
      .decr(rdskey)
      .pttl(rdskey)
      .exec(function(err, replies) {
        if (err) {
          return;
        }

        replies = processReplies(replies);
        setExpire(replies, rdskey);
      });
  };

  this.resetKey = function(key) {
    var rdskey = options.prefix + key;

    options.client.del(rdskey);
  };
};

module.exports = RedisStore;
