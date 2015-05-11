'use strict';

var _ = require('lodash');
var util = require('util');
var BaseQuery = require('./base');
var SelectQuery = require('./select');
var InsertQuery = require('./insert');
var UpdateQuery = require('./update');
var DeleteQuery = require('./delete');
var BoundQuery = require('./bound');
var RawQuery = require('./raw');
var Transaction = require('./mixins/transaction');

_.str = require('underscore.string');
_.mixin({ toSentenceSerial: _.str.toSentenceSerial });


/**
 * Queries are the building block of Azul's database abstraction layer. They
 * are immutable, chainable objects. Each operation that you perform on a query
 * will return a duplicated query rather than the original. The duplicated
 * query will be configured as requested.
 *
 * Generally, you will not create queries directly. Instead, you will receive
 * a query object via one of many convenience methods.
 *
 * @protected
 * @constructor EntryQuery
 * @param {Adapter} adapter The adapter to use when using the query.
 */
var EntryQuery = BaseQuery.extend(Transaction, /** @lends EntryQuery# */ {

  // spawn methods (documentation in files with class definitions)
  select: function() { return this._spawn(SelectQuery, arguments); },
  insert: function() { return this._spawn(InsertQuery, arguments); },
  update: function() { return this._spawn(UpdateQuery, arguments); },
  delete: function() { return this._spawn(DeleteQuery, arguments); },
  raw: function() { return this._spawn(RawQuery, arguments); },
  bind: function() { return this._spawn(BoundQuery, arguments); },

  /**
   * Override of {@link BaseQuery#statement}. Verifies that this is not used
   * directly.
   *
   * @method
   * @protected
   * @see {@link BaseQuery#statement}
   */
  _statement: function() {
    var result, underlyingError;
    try { result = this._super(); }
    catch (e) { underlyingError = e; }
    if (!result) {
      var quote = function(str) { return _.str.quote(str, '`'); };
      var msg = util.format('Must first call %s on query.', _([
        'select',
        'update',
        'insert',
        'delete',
        'raw',
        'bind',
        'bindTable'
      ]).map(quote).toSentenceSerial(', ', ' or '));
      throw _.extend(new Error(msg), {
        underlyingError: underlyingError
      });
    }
    return result;
  }
});

module.exports = EntryQuery.reopenClass({ __name__: 'EntryQuery' });
