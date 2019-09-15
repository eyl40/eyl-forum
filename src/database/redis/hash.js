'use strict';

module.exports = function (redisClient, module) {
	var helpers = module.helpers.redis;

	const async = require('async');
	const _ = require('lodash');

	const cache = require('../cache').create('redis');

	module.objectCache = cache;

	module.setObject = function (key, data, callback) {
		callback = callback || function () {};
		if (!key || !data) {
			return callback();
		}

		if (data.hasOwnProperty('')) {
			delete data[''];
		}

		Object.keys(data).forEach(function (key) {
			if (data[key] === undefined || data[key] === null) {
				delete data[key];
			}
		});

		if (!Object.keys(data).length) {
			return callback();
		}
		redisClient.hmset(key, data, function (err) {
			if (err) {
				return callback(err);
			}
			cache.delObjectCache(key);
			callback();
		});
	};

	module.setObjectField = function (key, field, value, callback) {
		callback = callback || function () {};
		if (!field) {
			return callback();
		}
		redisClient.hset(key, field, value, function (err) {
			if (err) {
				return callback(err);
			}
			cache.delObjectCache(key);
			callback();
		});
	};

	module.getObject = function (key, callback) {
		if (!key) {
			return setImmediate(callback, null, null);
		}

		module.getObjectsFields([key], [], function (err, data) {
			callback(err, data && data.length ? data[0] : null);
		});
	};

	module.getObjects = function (keys, callback) {
		module.getObjectsFields(keys, [], callback);
	};

	module.getObjectField = function (key, field, callback) {
		if (!key) {
			return setImmediate(callback, null, null);
		}
		const cachedData = {};
		cache.getUnCachedKeys([key], cachedData);
		if (cachedData[key]) {
			return setImmediate(callback, null, cachedData[key].hasOwnProperty(field) ? cachedData[key][field] : null);
		}
		redisClient.hget(key, field, callback);
	};

	module.getObjectFields = function (key, fields, callback) {
		if (!key) {
			return setImmediate(callback, null, null);
		}
		module.getObjectsFields([key], fields, function (err, results) {
			callback(err, results ? results[0] : null);
		});
	};

	module.getObjectsFields = function (keys, fields, callback) {
		if (!Array.isArray(keys) || !keys.length) {
			return setImmediate(callback, null, []);
		}
		if (!Array.isArray(fields)) {
			return callback(null, keys.map(function () { return {}; }));
		}
		const cachedData = {};
		const unCachedKeys = cache.getUnCachedKeys(keys, cachedData);

		async.waterfall([
			function (next) {
				if (unCachedKeys.length > 1) {
					helpers.execKeys(redisClient, 'batch', 'hgetall', unCachedKeys, next);
				} else if (unCachedKeys.length === 1) {
					redisClient.hgetall(unCachedKeys[0], (err, data) => next(err, [data]));
				} else {
					next(null, []);
				}
			},
			function (data, next) {
				unCachedKeys.forEach(function (key, i) {
					cachedData[key] = data[i] || null;
					cache.set(key, cachedData[key]);
				});

				var mapped = keys.map(function (key) {
					if (!fields.length) {
						return _.clone(cachedData[key]);
					}

					const item = cachedData[key] || {};
					const result = {};
					fields.forEach((field) => {
						result[field] = item[field] !== undefined ? item[field] : null;
					});
					return result;
				});
				next(null, mapped);
			},
		], callback);
	};

	module.getObjectKeys = function (key, callback) {
		redisClient.hkeys(key, callback);
	};

	module.getObjectValues = function (key, callback) {
		redisClient.hvals(key, callback);
	};

	module.isObjectField = function (key, field, callback) {
		redisClient.hexists(key, field, function (err, exists) {
			callback(err, exists === 1);
		});
	};

	module.isObjectFields = function (key, fields, callback) {
		helpers.execKeyValues(redisClient, 'batch', 'hexists', key, fields, function (err, results) {
			callback(err, Array.isArray(results) ? helpers.resultsToBool(results) : null);
		});
	};

	module.deleteObjectField = function (key, field, callback) {
		callback = callback || function () {};
		if (key === undefined || key === null || field === undefined || field === null) {
			return setImmediate(callback);
		}
		redisClient.hdel(key, field, function (err) {
			cache.delObjectCache(key);
			callback(err);
		});
	};

	module.deleteObjectFields = function (key, fields, callback) {
		helpers.execKeyValues(redisClient, 'batch', 'hdel', key, fields, function (err) {
			cache.delObjectCache(key);
			callback(err);
		});
	};

	module.incrObjectField = function (key, field, callback) {
		module.incrObjectFieldBy(key, field, 1, callback);
	};

	module.decrObjectField = function (key, field, callback) {
		module.incrObjectFieldBy(key, field, -1, callback);
	};

	module.incrObjectFieldBy = function (key, field, value, callback) {
		callback = callback || helpers.noop;
		function done(err, result) {
			if (err) {
				return callback(err);
			}
			cache.delObjectCache(key);
			callback(null, Array.isArray(result) ? result.map(value => parseInt(value, 10)) : parseInt(result, 10));
		}
		value = parseInt(value, 10);
		if (!key || isNaN(value)) {
			return callback(null, null);
		}
		if (Array.isArray(key)) {
			var batch = redisClient.batch();
			key.forEach(function (key) {
				batch.hincrby(key, field, value);
			});
			batch.exec(done);
		} else {
			redisClient.hincrby(key, field, value, done);
		}
	};
};