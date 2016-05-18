'use strict';
var defaults = require('defaults');
var redis = require('redis');

var RedisStore = function(options) {
  options = defaults(options, {
    expiry: 60, // default expiry is one minute
    prefix: "rl:"
  });

  // create the client if one isn't provided
  options.client = options.client || redis.createClient();

  this.incr = function(key, cb) {
    var rdskey = options.prefix + key;

    options.client.incr(rdskey, function(err, reply) {
      if (err) {
        return cb(err);
      }

      // if this is new
      if (reply === 1) {
        // then expire it
        options.client.expire(rdskey, options.expiry);
      }

      cb(null, reply);
    });
  };

  this.resetKey = function(key) {
    var rdskey = options.prefix + key;

    options.client.del(rdskey);
  };
};

module.exports = RedisStore;
