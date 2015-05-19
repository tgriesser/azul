'use strict';

var _ = require('lodash');
var BluebirdPromise = require('bluebird');
var Adapter = require('./base');
var mysql = require('mysql');
var date = require('../util/date');

BluebirdPromise.promisifyAll(mysql);
BluebirdPromise.promisifyAll(require('mysql/lib/Connection').prototype);

var returning = require('./mixins/returning'),
  EmbedPseudoReturn = returning.EmbedPseudoReturn,
  ExtractPseudoReturn = returning.ExtractPseudoReturn;

/**
 * MySQL Adapter.
 *
 * @public
 * @constructor
 * @extends Adapter
 */
var MySQLAdapter = Adapter.extend(/** @lends MySQLAdapter# */ {

  /**
   * Connect for MySQLAdapter.
   *
   * @method
   * @protected
   * @see {@link Adapter#_connect}
   */
  _connect: BluebirdPromise.method(function() {
    return mysql.createConnection(this._connection);
  }),

  /**
   * Disconnect for MySQLAdapter.
   *
   * @method
   * @protected
   * @see {@link Adapter#_disconnect}
   */
  _disconnect: BluebirdPromise.method(function(connection) {
    return connection.end();
  }),

  /**
   * Execute for MySQLAdapter.
   *
   * @method
   * @private
   * @see {@link Adapter#_execute}
   */
  _execute: BluebirdPromise.method(function(connection, sql, args, returning) {
    return BluebirdPromise.bind({})
    .then(function() {
      return connection.queryAsync(sql, args);
    })
    .spread(function(rows, fields) {
      if (rows.insertId) { returning(rows.insertId); }
      return {
        rows: fields ? rows : [],
        fields: _.map(fields, 'name')
      };
    });
  })

});

MySQLAdapter.reopenClass(/** @lends MySQLAdapter */ {

  /**
   * @protected
   * @constructor
   * @extends Adapter.Phrasing
   */
  Phrasing: Adapter.Phrasing.extend({

    /**
     * Override of {@link Phrasing#createColumn}.
     *
     * The base class adds REFERENCES to each column definition which MySQL
     * parses, but does not use to create FOREIGN KEY constraints. We need to
     * add a FOREIGN KEY constraint for each created column.
     *
     * @method
     * @public
     * @see {@link Phrasing#createColumn}.
     */
    createColumn: function(column) {
      var generic = this._super.apply(this, arguments);
      var fragments = [generic];
      if (column.options.references) {
        fragments.push(', ',
          this.foreignKeyConstraint(column));
      }
      return this._grammar.join(fragments);
    },

    /**
     * Override of {@link Phrasing#addColumn}.
     *
     * The base class adds REFERENCES to each column definition which MySQL
     * parses, but does not use to create FOREIGN KEY constraints. We need to
     * add a FOREIGN KEY constraint for each added column.
     *
     * Uses the super class create column method to generate the column
     * details.
     *
     * @method
     * @public
     * @see {@link Phrasing#addColumn}.
     */
    addColumn: function(column) {
      var createColumn = this.createColumn.superFunction.bind(this);
      var fragments = ['ADD COLUMN ', createColumn(column)];
      if (column.options.references) {
        fragments.push(', ADD ',
          this.foreignKeyConstraint(column));
      }
      return this._grammar.join(fragments);
    },

    /**
     * Override of {@link Phrasing#foreignKey}.
     *
     * Since the base class defines foreign keys using REFERENCES, we just
     * return nothing here so we don't repeat that multiple times. The only
     * real reason is to avoid confusion if someone reads the executed SQL
     * statements. It would not affect how the queries worked.
     *
     * @method
     * @public
     * @see {@link Phrasing#foreignKey}.
     */
    foreignKey: function(/*column*/) {
      return '';
    },

    /**
     * Generate foreign key constraint that works for MySQL.
     *
     * Uses the super class foreign key method to generate the REFERENCES
     * portion of the constraint string.
     *
     * @method
     * @public
     * @param {Object} column
     * @return {Fragment} The fragment.
     */
    foreignKeyConstraint: function(column) {
      var quoteField = this._grammar.field.bind(this._grammar);
      var fragments = ['FOREIGN KEY (', quoteField(column.name), ') '];
      var foreignKey = this.foreignKey.superFunction.bind(this);
      fragments.push(foreignKey(column));
      return this._grammar.join(fragments);
    },

  }),

  /**
   * @protected
   * @constructor
   * @extends Adapter.Grammar
   */
  Grammar: Adapter.Grammar.extend(/** @lends MySQLAdapter.grammar */ {
    quote: function(string) {
      return mysql.escapeId(string);
    },
    escape: function(value) {
      value = _.isString(value) ? value.replace('\\', '\\\\') : value;
      return this._super(value);
    }
  }, { __name__: 'MySQLGrammar' }),

  /**
   * @protected
   * @constructor
   * @extends Adapter.Translator
   */
  Translator: Adapter.Translator.extend(/** @lends MySQLAdapter.Translator */ {
    predicateForIExact: function(p) {
      return this._super(p).using('%s LIKE %s');
    },
    predicateForContains: function(p) {
      return this._super(p).using('%s LIKE BINARY %s')
        .value('like', 'contains');
    },
    predicateForIContains: function(p) {
      return this._super(p).using('%s LIKE %s').value('like', 'contains');
    },
    predicateForRegex: function(p) {
      return this._super(p).using('%s REGEXP BINARY %s').value('regex');
    },
    predicateForIRegex: function(p) {
      return this._super(p).using('%s REGEXP %s').value('regex');
    },
    predicateForStartsWith: function(p) {
      return this._super(p).using('%s LIKE BINARY %s')
        .value('like', 'startsWith');
    },
    predicateForIStartsWith: function(p) {
      return this._super(p).using('%s LIKE %s').value('like', 'startsWith');
    },
    predicateForEndsWith: function(p) {
      return this._super(p).using('%s LIKE BINARY %s')
        .value('like', 'endsWith');
    },
    predicateForIEndsWith: function(p) {
      return this._super(p).using('%s LIKE %s').value('like', 'endsWith');
    },
    predicateForWeekday: function(p) {
      var parseWeekday = date.parseWeekdayToInt;
      var shift = function(n) { return (n + 6) % 7; };
      return this._super(p).using('WEEKDAY(%s) = %s')
        .value(parseWeekday, shift);
    },

    typeForSerial: function() { return 'integer primary key auto_increment'; },
    typeForBinary: function() { return 'longblob'; },

    /**
     * Boolean type for MySQL database backend.
     *
     * Booleans in MySQL are actually stored as numbers. A value of 0 is
     * considered false. Nonzero values are considered true.
     *
     * @method
     * @public
     * @see {@link Translator#type}
     */
    typeForBool: function() { return this._super.apply(this, arguments); },

    /**
     * Decimal type for MySQL database backend.
     *
     * The decimal type for MySQL applies default values of `precision: 64` and
     * `scale: 30` if no precision is given.
     *
     * @method
     * @public
     * @see {@link Translator#type}
     */
    typeForDecimal: function(options) {
      var opts = _.clone(options || {});
      if (!opts.precision) {
        opts.precision = 64;
        opts.scale = 30;
      }
      return this._super(opts);
    }

  }, { __name__: 'MySQLTranslator' })
});

MySQLAdapter.Phrasing.reopen(EmbedPseudoReturn);
MySQLAdapter.reopen(ExtractPseudoReturn);

module.exports = MySQLAdapter.reopenClass({ __name__: 'MySQLAdapter' });
