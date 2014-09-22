'use strict';

var customError      = require('es5-ext/error/custom')
  , defineLength     = require('es5-ext/function/_define-length')
  , partial          = require('es5-ext/function/#/partial')
  , copy             = require('es5-ext/object/copy')
  , normalizeOpts    = require('es5-ext/object/normalize-options')
  , callable         = require('es5-ext/object/valid-callable')
  , d                = require('d')
  , WeakMap          = require('es6-weak-map')
  , resolveLength    = require('./resolve-length')
  , extensions       = require('./registered-extensions')
  , resolveResolve   = require('./resolve-resolve')
  , resolveNormalize = require('./resolve-normalize')

  , slice = Array.prototype.slice, defineProperties = Object.defineProperties
  , clearOnDispose;

clearOnDispose = function () {
	throw customError("Clear of Weak Map based configuration is not possible together with " +
		" 'dispose' option", 'CLEAR_WITH_DISPOSE');
};

module.exports = function (memoize) {
	return function (fn/*, options*/) {
		var map, length, options = normalizeOpts(arguments[1]), memoized, resolve, normalizer;

		callable(fn);
		length = resolveLength(options.length, fn.length, options.async && extensions.async);
		options.length = length ? length - 1 : 0;
		map = new WeakMap();

		if (options.resolvers) resolve = resolveResolve(options.resolvers);
		if (options.normalizer) normalizer = resolveNormalize(options.normalizer);

		if ((length === 1) && !normalizer && !(options.async && extensions.async) &&
				!(options.dispose && extensions.dispose) && !(options.maxAge && extensions.maxAge) &&
				!(options.max && extensions.max) && !(options.refCounter && extensions.refCounter)) {
			return defineProperties(function (obj) {
				var result;
				if (resolve) obj = resolve(arguments)[0];
				if (map.has(obj)) return map.get(obj);
				result = fn.call(this, obj);
				if (map.has(obj)) throw customError("Circular invocation", 'CIRCULAR_INVOCATION');
				map.set(obj, result);
				return result;
			}, {
				__memoized__: d(true),
				delete: d(function (obj) {
					if (resolve) obj = resolve(arguments)[0];
					return map.delete(obj);
				}),
				clear: d(map.clear.bind(map))
			});
		}
		memoized = defineProperties(defineLength(function (obj) {
			var memoizer, args = arguments;
			if (resolve) {
				args = resolve(args);
				obj = args[0];
			}
			memoizer = map.get(obj);
			if (!memoizer) {
				if (normalizer) {
					options = copy(options);
					options.normalizer = copy(normalizer);
					options.normalizer.get = partial.call(options.normalizer.get, obj);
					options.normalizer.set = partial.call(options.normalizer.set, obj);
					if (options.normalizer.delete) {
						options.normalizer.delete = partial.call(options.normalizer.delete, obj);
					}
				}
				map.set(obj, memoizer = memoize(partial.call(fn, obj), options));
			}
			return memoizer.apply(this, slice.call(args, 1));
		}, length), {
			__memoized__: d(true),
			delete: d(defineLength(function (obj) {
				var memoizer, args = arguments;
				if (resolve) {
					args = resolve(args);
					obj = args[0];
				}
				memoizer = map.get(obj);
				if (!memoizer) return;
				memoizer.delete.apply(this, slice.call(args, 1));
			}, length)),
			clear: d(options.dispose ? clearOnDispose : map.clear.bind(map))
		});
		if (!options.refCounter || !extensions.refCounter) return memoized;
		defineProperties(memoized, {
			deleteRef: d(defineLength(function (obj) {
				var memoizer, args = arguments;
				if (resolve) {
					args = resolve(args);
					obj = args[0];
				}
				memoizer = map.get(obj);
				if (!memoizer) return null;
				return memoizer.deleteRef.apply(this, slice.call(args, 1));
			}, length)),
			getRefCount: d(defineLength(function (obj) {
				var memoizer, args = arguments;
				if (resolve) {
					args = resolve(args);
					obj = args[0];
				}
				memoizer = map.get(obj);
				if (!memoizer) return 0;
				return memoizer.getRefCount.apply(this, slice.call(args, 1));
			}, length))
		});
		return memoized;
	};
};