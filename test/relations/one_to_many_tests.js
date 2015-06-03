'use strict';

require('../helpers');

var chai = require('chai');
var sinon = require('sinon');
var expect = chai.expect;

var _ = require('lodash');
var Promise = require('bluebird');
var Database = require('../../lib/database');
var FakeAdapter = require('../fakes/adapter');

var db,
  adapter,
  Article,
  User;

describe('Model one-to-many', function() {
  beforeEach(function() {
    adapter = FakeAdapter.create({});
    db = Database.create({ adapter: adapter });

    var hasMany = db.hasMany;
    var belongsTo = db.belongsTo;
    var attr = db.attr;

    Article = db.model('article').reopen({
      title: attr(),
      author: belongsTo('user'),
    });
    User = db.model('user').reopen({
      username: attr(),
      articles: hasMany('article', { inverse: 'author' })
    });
  });

  beforeEach(function() {
    this.author = User.fresh({ id: 395, username: 'miles' });
    this.article = Article.fresh({ id: 828, title: 'Dog Psychology' });
  });

  beforeEach(function() {
    adapter.intercept(/select.*from "users"/i, {
      fields: ['id', 'username'],
      rows: [{ id: 1, username: 'wbyoung' }]
    });
    adapter.intercept(/select.*from "articles"/i, {
      fields: ['id', 'title'],
      rows: [{ id: 1, title: 'Journal', 'author_id': 1 }]
    });
    adapter.intercept(/insert into "users"/i, {
      fields: ['id'],
      rows: [{ id: 43 }]
    });
  });

  describe('definition', function() {
    var keys = function(modelClass, relationName) {
      var prototype = modelClass.__class__.prototype;
      var relation = prototype[relationName + 'Relation'];
      return [
        relation.primaryKey, relation.primaryKeyAttr,
        relation.foreignKey, relation.foreignKeyAttr
      ];
    };

    it('defaults to logical primary & foreign keys', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany()
      });
      Article = db.model('article', {
        user: db.belongsTo()
      });
      expect(keys(User, 'articles')).to.eql(['pk', 'id', 'userId', 'user_id']);
      expect(keys(Article, 'user')).to.eql(['pk', 'id', 'userId', 'user_id']);
    });

    it('changes the foreign key based on the belongsTo relation name', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ inverse: 'author' })
      });
      Article = db.model('article', {
        author: db.belongsTo('user')
      });
      expect(keys(User, 'articles')).to.eql(['pk', 'id', 'authorId', 'author_id']);
      expect(keys(Article, 'author')).to.eql(['pk', 'id', 'authorId', 'author_id']);
    });

    it('allows custom foreign key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ inverse: 'author' })
      });
      Article = db.model('article', {
        author: db.belongsTo('user'),
        authorId: db.attr('author_fk')
      });
      expect(keys(User, 'articles')).to.eql(['pk', 'id', 'authorId', 'author_fk']);
      expect(keys(Article, 'author')).to.eql(['pk', 'id', 'authorId', 'author_fk']);
    });

    it('allows custom foreign key on belongsTo without inverse', function() {
      db = Database.create({ adapter: adapter });
      Article = db.model('article', {
        author: db.belongsTo('user'),
        authorId: db.attr('author_fk')
      });
      expect(keys(Article, 'author')).to.eql(['pk', 'id', 'authorId', 'author_fk']);
    });

    it('allows specific foreign key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ inverse: 'author' })
      });
      Article = db.model('article', {
        author: db.belongsTo('user', { foreignKey: 'authorFk' })
      });
      expect(keys(User, 'articles')).to.eql(['pk', 'id', 'authorFk', 'author_fk']);
      expect(keys(Article, 'author')).to.eql(['pk', 'id', 'authorFk', 'author_fk']);
    });

    it('allows specific foreign key on belongsTo without inverse', function() {
      db = Database.create({ adapter: adapter });
      Article = db.model('article', {
        author: db.belongsTo('user', { foreignKey: 'authorFk' }),
        authorFk: db.attr('author_key')
      });
      expect(keys(Article, 'author')).to.eql(['pk', 'id', 'authorFk', 'author_key']);
    });

    it('allows specific foreign key on hasMany without inverse', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ foreignKey: 'authorFk' })
      });
      expect(keys(User, 'articles')).to.eql(['pk', 'id', 'authorFk', 'author_fk']);
    });

    it('allows custom primary key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        pk: db.attr('social'),
        posts: db.hasMany('articles')
      });
      Article = db.model('article', {
        user: db.belongsTo({ inverse: 'posts' }),
      });
      expect(keys(User, 'posts'))
        .to.eql(['pk', 'social', 'userId', 'user_id']);
      expect(keys(Article, 'user'))
        .to.eql(['pk', 'social', 'userId', 'user_id']);
    });

    it('allows custom primary key on hasMany without inverse', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        pk: db.attr('social'),
        posts: db.hasMany('articles')
      });
      expect(keys(User, 'posts'))
        .to.eql(['pk', 'social', 'userId', 'user_id']);
    });

    it('allows specific primary key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        ssn: db.attr('social'),
        posts: db.hasMany('articles', { primaryKey: 'ssn' })
      });
      Article = db.model('article', {
        user: db.belongsTo({ inverse: 'posts' }),
      });
      expect(keys(User, 'posts'))
        .to.eql(['ssn', 'social', 'userId', 'user_id']);
      expect(keys(Article, 'user'))
        .to.eql(['ssn', 'social', 'userId', 'user_id']);
    });

    it('allows specific primary key on hasMany without inverse', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        ssn: db.attr('social'),
        posts: db.hasMany('articles', { primaryKey: 'ssn' })
      });
      expect(keys(User, 'posts'))
        .to.eql(['ssn', 'social', 'userId', 'user_id']);
    });

    it('allows specific primary key on belongsTo without inverse', function() {
      db = Database.create({ adapter: adapter });
      Article = db.model('article', {
        user: db.belongsTo({ primaryKey: 'ssn' }),
      });
      expect(keys(Article, 'user'))
        .to.eql(['ssn', 'ssn', 'userId', 'user_id']);
    });

    it('allows custom primary key & foreign key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        pk: db.attr('identifier'),
        posts: db.hasMany('articles', { inverse: 'author' }),
      });
      Article = db.model('article', {
        author: db.belongsTo('user', { inverse: 'posts' }),
        authorId: db.attr('author_fk')
      });
      expect(keys(User, 'posts'))
        .to.eql(['pk', 'identifier', 'authorId', 'author_fk']);
      expect(keys(Article, 'author'))
        .to.eql(['pk', 'identifier', 'authorId', 'author_fk']);
    });

    it('allows specific primary key & custom foreign key', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        ssn: db.attr('social'),
        posts: db.hasMany('articles', { inverse: 'author', primaryKey: 'ssn' }),
      });
      Article = db.model('article', {
        author: db.belongsTo('user', { inverse: 'posts', foreignKey: 'authorSSN' }),
        authorSSN: db.attr('author_ssn')
      });
      expect(keys(User, 'posts'))
        .to.eql(['ssn', 'social', 'authorSSN', 'author_ssn']);
      expect(keys(Article, 'author'))
        .to.eql(['ssn', 'social', 'authorSSN', 'author_ssn']);
    });

    it('allows custom primary key & foreign key attributes', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        ssn: db.attr('social'),
        posts: db.hasMany('articles', { inverse: 'author', primaryKey: 'ssn' }),
      });
      Article = db.model('article', {
        author: db.belongsTo('user', { inverse: 'posts', foreignKey: 'authorSSN' }),
        authorSSN: db.attr('author_ssn')
      });
      expect(keys(User, 'posts'))
        .to.eql(['ssn', 'social', 'authorSSN', 'author_ssn']);
      expect(keys(Article, 'author'))
        .to.eql(['ssn', 'social', 'authorSSN', 'author_ssn']);
    });

    it('ensures primary key on belongsTo matches hasMany', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        ssn: db.attr('social'),
        articles: db.hasMany({ primaryKey: 'ssn' }),
      });
      Article = db.model('article', {
        user: db.belongsTo({ primaryKey: 'wrong' }),
      });
      expect(function() {
        Article.__class__.prototype.userRelation.primaryKey;
      }).to.throw(/Article.user.*primary key.*"ssn".*User.articles/i);
    });

    it('ensures primary key on belongsTo matches value generated by hasMany', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany(),
      });
      Article = db.model('article', {
        user: db.belongsTo({ primaryKey: 'wrong' }),
      });
      expect(function() {
        Article.__class__.prototype.userRelation.primaryKey;
      }).to.throw(/Article.user.*primary key.*"pk".*User.articles/i);
    });

    it('ensures foreign key on hasMany matches belongsTo', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ foreignKey: 'wrong' }),
      });
      Article = db.model('article', {
        user: db.belongsTo({ foreignKey: 'userSSN' }),
      });
      expect(function() {
        User.__class__.prototype.articlesRelation.foreignKey;
      }).to.throw(/User.articles.*foreign key.*"userSSN".*Article.user/i);
    });

    it('ensures foreign key on hasMany matches value generated by belongsTo', function() {
      db = Database.create({ adapter: adapter });
      User = db.model('user', {
        articles: db.hasMany({ foreignKey: 'wrong' }),
      });
      Article = db.model('article', {
        user: db.belongsTo(),
      });
      expect(function() {
        User.__class__.prototype.articlesRelation.foreignKey;
      }).to.throw(/User.articles.*foreign key.*"userId".*Article.user/i);
    });

  });

  describe('belongsTo with hasMany associations disabled', function() {
    beforeEach(function() {
      sinon.spy(this.article, 'setAttribute');
      sinon.stub(this.author.articlesRelation, 'associate');
      sinon.stub(this.author.articlesRelation, 'disassociate');
    });

    it('sets the foreign key before the inverse when associating', function() {
      this.article.authorRelation
        .associate(this.article, this.author);

      var attrSpy = this.article.setAttribute;
      var associateSpy = this.author.articlesRelation.associate;
      expect(attrSpy).to.have.been.calledOnce;
      expect(associateSpy).to.have.been.calledOnce;
      expect(attrSpy).to.have.been.calledBefore(associateSpy);
    });

    it('sets the foreign key before the inverse when disassociating', function() {
      this.article.authorRelation
        .disassociate(this.article, this.author);

      var attrSpy = this.article.setAttribute;
      var disassociateSpy = this.author.articlesRelation.disassociate;
      expect(attrSpy).to.have.been.calledOnce;
      expect(disassociateSpy).to.have.been.calledOnce;
      expect(attrSpy).to.have.been.calledBefore(disassociateSpy);
    });
  });

  describe('hasMany with belongsTo associations disabled', function() {
    beforeEach(function() {
      sinon.spy(this.article, 'setAttribute');
      sinon.stub(this.article.authorRelation, 'associate');
      sinon.stub(this.article.authorRelation, 'disassociate');
    });

    it('sets the foreign key before the inverse when associating', function() {
      this.author.articlesRelation
        .associate(this.author, this.article);

      var attrSpy = this.article.setAttribute;
      var associateSpy = this.article.authorRelation.associate;
      expect(attrSpy).to.have.been.calledOnce;
      expect(associateSpy).to.have.been.calledOnce;
      expect(attrSpy).to.have.been.calledBefore(associateSpy);
    });

    it('sets the foreign key before the inverse when disassociating', function() {
      this.author.articlesRelation
        .disassociate(this.author, this.article);

      var attrSpy = this.article.setAttribute;
      var disassociateSpy = this.article.authorRelation.disassociate;
      expect(attrSpy).to.have.been.calledOnce;
      expect(disassociateSpy).to.have.been.calledOnce;
      expect(attrSpy).to.have.been.calledBefore(disassociateSpy);
    });
  });

  describe('when creating via belongsTo', function() {

    beforeEach(function() {
      this.author = this.article.createAuthor({ username: 'phil' });
    });

    it('creates hasMany collection cache', function() {
      expect(this.author.articles).to.eql([this.article]);
    });
  });

  describe('when creating via hasMany', function() {
    beforeEach(function() {
      this.article = this.author.createArticle({ title: 'Hello' });
    });

    it('creates an object of the correct type', function() {
      expect(this.article).to.to.be.an.instanceOf(Article.__class__);
    });

    it('sets inverse/belongsTo attribute', function() {
      expect(this.article.author).to.equal(this.author);
    });

  });

  describe('when adding existing object via hasMany', function() {
    beforeEach(function() {
      this.author.addArticle(this.article);
    });

    it('sets foreign key', function() {
      expect(this.article.authorId).to.eql(this.author.id);
    });

    it('sets related object', function() {
      expect(this.article.author).to.equal(this.author);
    });

    describe('when executed', function() {
      beforeEach(function(done) {
        this.author.save().then(function() { done(); }, done);
      });

      it('executes the proper sql', function() {
        expect(adapter.executedSQL()).to.eql([
          ['UPDATE "articles" SET "author_id" = ? WHERE "id" = ?', [395, 828]]
        ]);
      });
    });
  });

  describe('when removing existing object via hasMany', function() {
    beforeEach(function() {
      this.article.author = this.author;
      this.author.removeArticle(this.article);
    });

    it('clears foreign key', function() {
      expect(this.article.authorId).to.not.exist;
    });

    it('clears related object', function() {
      expect(this.article.author).to.not.exist;
    });

    describe('when executed', function() {
      beforeEach(function(done) {
        this.author.save().then(function() { done(); }, done);
      });

      it('executes the proper sql', function() {
        expect(adapter.executedSQL()).to.eql([
          ['UPDATE "articles" SET "author_id" = ? ' +
           'WHERE "id" = ?', [undefined, 828]]
        ]);
      });
    });
  });

  describe('when a hasMany relationship is pre-fetched', function() {
    var users;

    beforeEach(function(done) {
      User.objects.with('articles').fetch().then(function(result) {
        users = result;
      })
      .then(done, done);
    });

    it('caches the relevant belongsTo objects', function() {
      var user = users[0];
      expect(user.articles[0].author).to.eql(user);
    });
  });

  describe('when hasMany collection cache is loaded', function() {
    beforeEach(function(done) {
      this.author.articleObjects.fetch().then(function() { done(); }, done);
    });

    it('caches the relevant belongsTo objects', function() {
      expect(this.author.articles.length).to.eql(1);
      expect(this.author.articles[0].author).to.equal(this.author);
    });

    describe('when storing existing object via belongsTo', function() {
      beforeEach(function() { this.article.author = this.author; });

      it('adds to hasMany collection cache', function() {
        expect(this.author.articles).to.contain(this.article);
      });

      describe('when executed', function() {
        beforeEach(function(done) {
          this.article.save().then(function() { done(); }, done);
        });

        it('executes the proper sql', function() {
          expect(adapter.executedSQL()).to.eql([
            // included from the fetch when loading the cache
            ['SELECT * FROM "articles" WHERE "author_id" = ?', [395]],
            // note that this expectation depends on ordering of object
            // properties which is not guaranteed to be a stable ordering.
            ['UPDATE "articles" SET "title" = ?, "author_id" = ? ' +
             'WHERE "id" = ?', ['Dog Psychology', 395, 828]]
          ]);
        });
      });
    });

    describe('when removing existing object via belongsTo', function() {
      beforeEach(function() {
        this.article = this.author.articles[0];
        this.article.author = null;
      });

      it('removes from hasMany collection cache', function() {
        expect(this.author.articles).to.not.contain(this.article);
      });
    });

    describe('when changing existing object to new object via belongsTo', function() {
      beforeEach(function() {
        this.newAuthor = User.create({ username: 'reed' });
        this.article = this.author.articles[0];
        this.article.author = this.newAuthor;
      });

      it('removes from hasMany collection cache', function() {
        expect(this.author.articles).to.not.contain(this.article);
      });

      it('adds to hasMany collection cache', function() {
        expect(this.newAuthor.articles).to.contain(this.article);
      });
    });

    describe('json', function() {

      it('does not include relations', function() {
        expect(this.author.json).to.eql({
          id: 395,
          username: 'miles',
        });
        expect(this.article.json).to.eql({
          id: 828,
          authorId: undefined,
          title: 'Dog Psychology',
        });
      });

      it('can be extended to include relations', function() {
        User.reopen({
          toJSON: function() {
            return _.extend(this._super(), {
              articles: _.invoke(this.articles, 'toNestable')
            });
          },
        });
        Article.reopen({
          toNestable: function() {
            return _.omit(this.toObject(), 'authorId');
          },
          toJSON: function() {
            return _.extend(this.toNestable(), {
              author: this.author.toObject()
            });
          },
        });

        expect(this.author.json).to.eql({
          id: 395,
          username: 'miles',
          articles: [{ id: 1, title: 'Journal' }]
        });

        expect(this.author.articles[0].json).to.eql({
          id: 1,
          title: 'Journal',
          author: { id: 395, username: 'miles' },
        });

      });
    });
  });

  describe('when storing existing object via belongsTo', function() {
    beforeEach(function() { this.article.author = this.author; });

    it('does not load hasMany collection cache', function() {
      expect(function() {
        this.author.articles;
      }.bind(this)).to.throw(/articles.*not yet.*loaded/i);
    });

    describe('when executed', function() {
      beforeEach(function(done) {
        this.article.save().then(function() { done(); }, done);
      });

      it('executes the proper sql', function() {
        expect(adapter.executedSQL()).to.eql([
          // note that this expectation depends on ordering of object
          // properties which is not guaranteed to be a stable ordering.
          ['UPDATE "articles" SET "title" = ?, "author_id" = ? ' +
           'WHERE "id" = ?', ['Dog Psychology', 395, 828]]
        ]);
      });
    });
  });

  describe('when storing created object via belongsTo', function() {
    beforeEach(function() {
      this.author = User.create({ username: 'jack' });
      this.article.author = this.author;
    });

    it('adds to hasMany collection cache', function() {
      expect(this.author.articles).to.contain(this.article);
    });


    describe('when executed', function() {
      beforeEach(function(done) {
        this.article.save().then(function() { done(); }, done);
      });
    });
  });

  describe('when storing unsaved object via belongsTo', function() {
    beforeEach(function() {
      this.author.username = this.author.username + '_updated';
      this.article.author = this.author;
    });

    it('does not load hasMany collection cache', function() {
      expect(function() {
        this.author.articles;
      }.bind(this)).to.throw(/articles.*not yet.*loaded/i);
    });

    describe('when executed', function() {
      beforeEach(function(done) {
        this.article.save().then(function() { done(); }, done);
      });
    });
  });

  describe('when adding to a hasMany fails in the database', function() {
    beforeEach(function() {
      sinon.stub(adapter, '_execute', function() {
        return new Promise.reject(new Error('Intended test error.'));
      });
    });

    afterEach(function() {
      adapter._execute.restore();
    });

    beforeEach(function(done) {
      this.author.addArticle(this.article);
      this.author.save()
      .bind(this)
      .catch(function(e) {
        this.error = e;
      })
      .then(done, done);
    });

    it('gives a descriptive error', function() {
      expect(this.error).to.match(/intended test error/i);
    });

    it('leaves the belongsTo object in a dirty state', function() {
      expect(this.article).to.have.property('dirty', true);
    });

    it('leaves the hasMany object with in flight data', function() {
      var author = this.author;
      var relation = author.articlesRelation;
      var inFlight = relation._getInFlightData(author);
      expect(inFlight).to.eql({
        clear: false,
        add: [this.article],
        remove: [],
      });
    });

    describe('when retried & the database accepts it', function() {
      beforeEach(function() {
        adapter._execute.restore();
        sinon.spy(adapter, '_execute');
      });

      beforeEach(function(done) {
        this.author.save().then(function() { done(); }, done);
      });

      it('leaves the belongsTo object in a clean state', function() {
        expect(this.article).to.have.property('dirty', false);
      });

      it('leaves the hasMany object with no flight data', function() {
        var author = this.author;
        var relation = author.articlesRelation;
        var inFlight = relation._getInFlightData(author);
        expect(inFlight).to.eql({
          clear: false,
          add: [],
          remove: [],
        });
      });

      it('executes the proper sql', function() {
        expect(adapter.executedSQL()).to.eql([
          ['UPDATE "articles" SET "author_id" = ? WHERE "id" = ?', [395, 828]]
        ]);
      });
    });
  });
});
