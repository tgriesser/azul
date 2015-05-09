'use strict';

var util = require('util');
var Mixin = require('../../util/mixin');
var BluebirdPromise = require('bluebird');

/**
 * Transaction support for queries.
 *
 * @mixin Transaction
 */
module.exports = Mixin.create(/** @lends Transaction# */ {

  /**
   * Duplication implementation.
   *
   * @method
   * @protected
   * @see {@link BaseQuery#_take}
   */
  _take: function(orig) {
    this._super(orig);
    this._transaction = orig._transaction;
  },

  /**
   * Get the client associated with this transaction.
   *
   * @method
   * @protected
   */
  client: function() {
    return (this._transaction && this._transaction._transactionClient) ||
      this._super();
  },

  /**
   * Get the transaction for a query.
   *
   * @method Transaction#transaction
   * @public
   * @return {ChainedQuery} The existing transaction query.
   */

  /**
   * Create a new query that will be performed within the given transaction.
   *
   * @method Transaction#transaction
   * @public
   * @param {Object} transaction The transaction object, a query object
   * returned from {@link Transaction#begin}, to use.
   * @return {ChainedQuery} The newly configured query.
   */
  transaction: function(transaction) {
    var result;
    if (arguments.length === 0) { // getter
      result = this._transaction;
    }
    else { // setter
      var sql = this._transactionSQLOverride;
      var dup = this._dup();
      dup._transaction = transaction;

      if (sql) { dup._transactionSQLOverride = sql; }
      if (sql === 'rollback' || sql === 'commit') {
        dup._prepareForTransactionClientRelease();
      }

      result = dup;
    }
    return result;
  },

  /**
   * Perform validations that ensure the query meets expectations.
   *
   * @method
   * @private
   */
  _validateBeforeTransactionExecution: function() {
    var transaction = this._transaction;
    if (this._transactionSQLOverride === 'begin') {
      // don't throw for beginning a transaction
    }
    else if (!transaction && this._transactionSQLOverride) {
      throw new Error(util.format('Must associate %j with a transaction.',
        this._transactionSQLOverride));
    }
    else if (transaction && transaction._transactionNeedsToAcquireClient) {
      throw new Error('Must execute `begin` query before using transaction.');
    }
    else if (transaction && transaction._transactionClosed &&
      !this._transactionSQLOverride) {
      throw new Error('Cannot execute query using ' +
        'committed/resolved transaction.');
    }
    return true;
  },

  /**
   * Actions to take before the transaction executes. This will acquire a
   * client for the transaction if one has not already been acquired.
   *
   * @method
   * @private
   */
  _beforeTransactionExecution: BluebirdPromise.method(function() {
    if (!this._validateBeforeTransactionExecution() ||
        !this._transaction) { return; }

    var result;
    var transaction = this._transaction;
    if (transaction._transactionNeedsToAcquireClient) {
      result = transaction._adapter.pool
      .acquireAsync()
      .then(function(client) {
        transaction._transactionClient = client;
      });
      transaction._transactionClientPromise = result;
      transaction._transactionNeedsToAcquireClient = false;
    }
    else {
      // all queries that are chained off of this one or explicitly use this
      // transaction need to wait on the promise that was first created to
      // fulfill so that they'll have a client.
      result = transaction._transactionClientPromise;
    }
    return result;
  }),

  /**
   * Actions to take after the transaction executes. This will release the
   * client from the transaction if it is no longer needed.
   *
   * @method
   * @private
   */
  _afterTransactionExecution: BluebirdPromise.method(function() {
    if (!this._transaction) { return; }

    var transaction = this._transaction;
    if (transaction._transactionNeedsToReleaseClient) {
      transaction._adapter.pool.release(transaction._transactionClient);
      transaction._transactionClient = undefined;
      transaction._transactionNeedsToReleaseClient = false;
    }
  }),

  /**
   * Override of {@link BaseQuery#_execute}.
   *
   * @private
   * @see {@link BaseQuery#_execute}
   */
  _execute: BluebirdPromise.method(function() {
    var self = this;
    return this._beforeTransactionExecution()
      .then(this._super)
      .tap(function() { return self._afterTransactionExecution(); });
  }),

  /**
   * Begin a new transaction.
   *
   * The resulting object is a query that must be executed to actually perform
   * the begin.
   *
   * @method
   * @public
   * @return {ChainedQuery} The newly configured query.
   */
  begin: function() {
    var dup = this._dup();
    dup._transactionSQLOverride = 'begin';
    dup._transaction = dup._transaction || dup;
    dup._prepareForTransactionClientAcquire();
    return dup;
  },

  /**
   * Commit a transaction. This query must have been configured to be using
   * a transaction with {@link Transaction#begin} or
   * {@link Transaction#transaction} before it can be committed.
   *
   * The resulting object is a query that must be executed to actually perform
   * the commit.
   *
   * @method
   * @public
   * @return {ChainedQuery} The newly configured query.
   */
  commit: function() {
    var dup = this._dup();
    dup._transactionSQLOverride = 'commit';
    dup._prepareForTransactionClientRelease();
    return dup;
  },

  /**
   * Rollback a transaction. This query must have been configured to be using
   * a transaction with {@link Transaction#begin} or
   * {@link Transaction#transaction} before it can be rolled back.
   *
   * The resulting object is a query that must be executed to actually perform
   * the rollback.
   *
   * @method
   * @public
   * @return {ChainedQuery} The newly configured query.
   */
  rollback: function() {
    var dup = this._dup();
    dup._transactionSQLOverride = 'rollback';
    dup._prepareForTransactionClientRelease();
    return dup;
  },

  /**
   * Prepare this query for acquiring a client.
   *
   * @method
   * @private
   */
  _prepareForTransactionClientAcquire: function() {
    if (!this._transaction) { return; }
    if (!this._transaction._transactionDepth) {
      this._transaction._transactionDepth = 0;
      this._transaction._transactionNeedsToAcquireClient = true;
    }
    this._transaction._transactionDepth += 1;
  },

  /**
   * Prepare this query for releasing a client.
   *
   * @method
   * @private
   */
  _prepareForTransactionClientRelease: function() {
    if (!this._transaction) { return; }
    if (this._transaction._transactionDepth === 1) {
      this._transaction._transactionNeedsToReleaseClient = true;
      this._transaction._transactionClosed = true;
    }
    this._transaction._transactionDepth -= 1;
  },

  /**
   * Override of {@link BaseQuery#statement}.
   *
   * @protected
   * @see {@link BaseQuery#statement}
   */
  _statement: function() {
    return this._transactionSQLOverride ?
      this._adapter.phrasing[this._transactionSQLOverride]() : this._super();
  }
});
