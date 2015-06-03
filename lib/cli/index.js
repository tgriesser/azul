'use strict';

/**
 * The command line interface module.
 *
 * While working within this module, considerations to take into
 * account include, but are not limited to:
 *
 * - The module is loaded by the CLI before the Liftoff has completed, so it
 *   is always included from the globally installed Azul module.
 *
 * - Since it is possible that Liftoff will require spawning a new node process
 *   to handle any v8 flags, it is possible for the module to end up being
 *   required more than once (in separate processes) before {@link cli.run} is
 *   actually called. It's therefore important to limit the scope of work
 *   performed in this module (especially work that is not contained within
 *   {@link cli.run}).
 *
 * - The exported {@link cli.run} function is called by the Liftoff invocation
 *   from a local install of Azul if it is available, but will be called from
 *   the globally installed Azul if a local version is not found. When called
 *   from the global install, there is an expectation that the CLI provide
 *   basic help functionality, but not actually execute any commands.
 *
 * - Requiring any other dependencies from within the Azul module before
 *   checking if this is loaded from a local install is not recommended. This
 *   includes requires both at the module level as well as within the
 *   {@link cli.run} function.
 *
 * @namespace cli
 * @private
 */

var _ = require('lodash');
var chalk = require('chalk');
var tildify = require('tildify');
var commander = require('commander');

/**
 * Verify the Liftoff environment and exit the program if we are not in a
 * suitable environment to operate.
 *
 * @private
 * @function cli.verifyEnvironment
 * @param {Object} env The liftoff environment.
 */
var verifyEnvironment = function(env, action) {
  if (!env.modulePath) {
    console.log(chalk.red('Local azul not found in'),
      chalk.magenta(tildify(env.cwd)));
    console.log(chalk.red('Try running: npm install azul'));
    process.exit(1);
  }

  if (!env.configPath && action.azulfile) {
    console.log(chalk.red('No azulfile found'));
    process.exit(1);
  }
};

/**
 * Setup for each of the different commands. Actions can be found in the
 * `actions.js` file and are separated in order to avoid using the global
 * install. See the comments at the top of the file for more details.
 *
 * @scope cli~describe
 */
var describe = {

  /**
   * Setup program.
   *
   * @private
   * @function
   */
  program: function(program) {
    return program
      .version(require('../../package.json').version)
      .usage('[options] command')
      .option('--cwd <cwd>', 'change the current working directory')
      .option('--azulfile <azulfile>', 'use a specific config file')
      .option('--require <require>', 'require external module')
      .option('--completion <value>', 'a method to handle shell completions');
  },

  /**
   * Add init command & description.
   *
   * @private
   * @function
   */
  init: function(program) {
    return program.command('init [db-type]')
      .description('set up a new project');
  },

  /**
   * Add migrate command, options & description.
   *
   * @private
   * @function
   */
  migrate: function(program) {
    return program.command('migrate')
      .option('-m, --migrations <dir>',
        'path to migrations directory', './migrations')
      .description('migrate to the latest schema');
  },

  /**
   * Add rollback command, options & description.
   *
   * @private
   * @function
   */
  rollback: function(program) {
    return program.command('rollback')
      .option('-m, --migrations <dir>',
        'path to migrations directory', './migrations')
      .description('rollback the last migration');
  },

  /**
   * Add make-migration command, options & description.
   *
   * @private
   * @function
   */
  generate: function(program) {
    return program.command('make-migration <name>').alias('mm')
      .description('make a migration file');
  },
};


/**
 * Run the command line interface using a Liftoff configuration.
 *
 * There are some considerations to take into account when working with this
 * function that have been outlined in {@link cli}.
 *
 * @private
 * @function cli.run
 * @param {Object} env The liftoff environment.
 * @see cli
 */
module.exports = function(env) {

  var action = {};

  /**
   * We need capture the requested action & execute it after checking that all
   * required values are set on env. this allows the cli to still run things
   * like help when azul is not installed locally or is missing a configuration
   * file.
   *
   * @function cli~capture
   * @private
   */
  var captureAction = function(details) {
    return function() {
      var args = _.toArray(arguments);
      var options = _.last(args);
      action.options = options;
      action.name = options.name();
      action.args = args;
      action = _.defaults(action, details, { azulfile: true });
    };
  };

  var program = new commander.Command();
  describe.program(program);
  describe.init(program).action(captureAction({ azulfile: false }));
  describe.migrate(program).action(captureAction());
  describe.rollback(program).action(captureAction());
  describe.generate(program).action(captureAction());
  program.parse(process.argv);

  if (!action.name) {
    program.help();
  }

  verifyEnvironment(env, action);

  // at this point, we can require modules from within Azul since we know we're
  // working with the local install.
  var actions = require('./actions');
  var fn = actions[action.name];
  var args = [];
  args = args.concat(action.azulfile ? [require(env.configPath)] : []);
  args = args.concat([action.options]);
  args = args.concat(action.args);
  fn.apply(undefined, args);
};

/**
 * Require hook for liftoff.
 *
 * @param {String} name
 * @param {Object} module
 */
module.exports.require = function(name/*, module*/) {
  console.log('Requiring external module', chalk.magenta(name));
};

/**
 * Require-fail hook for liftoff.
 *
 * @param {String} name
 * @param {Error} error
 */
module.exports.requireFail = function(name/*, err*/) {
  console.log(chalk.red('Failed to load external module'), chalk.magenta(name));
};

/**
 * Respawn hook for liftoff.
 *
 * @param {Array.<String>} flags
 * @param {Object} child
 */
module.exports.respawn = function(flags, child) {
  console.log('Node flags detected:', chalk.magenta(flags.join(', ')));
  console.log('Respawned to PID:', chalk.magenta(child.pid));
};
