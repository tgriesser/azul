
'use strict';

var _ = require('lodash');
var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon'); chai.use(require('sinon-chai'));

var Database = require('../../lib/database');
var FakeAdapter = require('../fakes/adapter');

require('../helpers/model');

var db,
  adapter,
  Student,
  Course,
  Enrollment;

describe('Model many-to-many', function() {
  beforeEach(function() {
    adapter = FakeAdapter.create({});
    db = Database.create({ adapter: adapter });

    var hasMany = db.hasMany;
    var belongsTo = db.belongsTo;
    var attr = db.attr;

    Student = db.model('student').reopen({
      name: attr(),
      enrollments: hasMany(),
      courses: hasMany({ through: 'enrollments' })
    });
    Course = db.model('course').reopen({
      subject: attr(),
      enrollments: hasMany(),
      students: hasMany({ through: 'enrollments' })
    });
    Enrollment = db.model('enrollment').reopen({
      date: attr(),
      student: belongsTo(),
      course: belongsTo()
    });
  });

  beforeEach(function() {
    adapter.intercept(/select.*from "students"/i, {
      fields: ['id', 'name'],
      rows: [{ id: 6, name: 'Whitney' }, { id: 7, name: 'Kristen' }]
    });
    adapter.intercept(/select.*from "students" where "id" = ?/i, {
      fields: ['id', 'name'],
      rows: [{ id: 6, name: 'Whitney' }]
    });
    adapter.intercept(/select.*from "courses"/i, {
      fields: ['id', 'subject'],
      rows: [{ id: 3, subject: 'CS 101' }, { id: 9, subject: 'History 101' }]
    });
    adapter.intercept(/select.*from "enrollments"/i, {
      fields: ['id', 'student_id', 'course_id', 'date'],
      rows: [{
        id: 1, 'student_id': 6, 'course_id': 3,
        date: new Date(2014, 12, 17)
      }, {
        id: 2, 'student_id': 6, 'course_id': 9,
        date: new Date(2014, 12, 16)
      }, {
        id: 3, 'student_id': 7, 'course_id': 3,
        date: new Date(2014, 12, 16)
      }]
    });
  });

  beforeEach(function() {
    this.student = Student.fresh({ id: 6, name: 'Whitney' });
    this.course = Course.fresh({ id: 3, subject: 'CS' });
  });

  describe('when spying on models & relationships', function() {
    beforeEach(function() {
      sinon.spy(this.student, 'setAttribute');
      sinon.spy(this.course, 'setAttribute');

      sinon.spy(this.student.enrollmentsRelation, 'associate');
      sinon.spy(this.student.enrollmentsRelation, 'disassociate');
      sinon.spy(this.course.enrollmentsRelation, 'associate');
      sinon.spy(this.course.enrollmentsRelation, 'disassociate');

      sinon.stub(this.course.studentsRelation, 'associate');
      sinon.stub(this.course.studentsRelation, 'disassociate');
    });

    describe('when associating', function() {
      beforeEach(function() {
        this.student.coursesRelation.associate(this.student, this.course);
      });

      it('does not set attributes', function() {
        expect(this.student.setAttribute).to.not.have.been.called;
        expect(this.course.setAttribute).to.not.have.been.called;
      });

      it('does not associate relations it is through', function() {
        expect(this.student.enrollmentsRelation.associate)
          .to.not.have.been.called;
        expect(this.course.enrollmentsRelation.associate)
          .to.not.have.been.called;
      });
    });

    describe('when disassociating', function() {
      beforeEach(function() {
        this.student.coursesRelation.disassociate(this.student, this.course);
      });

      it('does not set attributes', function() {
        expect(this.student.setAttribute).to.not.have.been.called;
        expect(this.course.setAttribute).to.not.have.been.called;
      });

      it('does not disassociate relations it is through', function() {
        expect(this.student.enrollmentsRelation.disassociate)
          .to.not.have.been.called;
        expect(this.course.enrollmentsRelation.disassociate)
          .to.not.have.been.called;
      });
    });

  });

  describe('when creating an object', function() {

    beforeEach(function() {
      this.course = this.student.createCourse({ subject: 'Anthropology' });
    });

    it('creates an object of the correct type', function() {
      expect(this.course).to.to.be.an.instanceOf(Course.__class__);
    });

    it('creates the collection cache', function() {
      expect(this.course.students).to.eql([this.student]);
    });
  });

  describe('when a relationship is pre-fetched', function() {
    var courses;

    beforeEach(function(done) {
      Course.objects.with('students').fetch().then(function(result) {
        courses = result;
      })
      .then(done, done);
    });

    it('caches the relevant related objects', function() {
      expect(_.map(courses[1].students, 'attrs'))
        .to.eql([this.student.attrs]);
    });

    it('does not load the inverse cache', function() {
      var course = courses[0];
      var student = course.students[0];

      expect(function() {
        student.courses;
      }.bind(this)).to.throw(/courses.*not yet.*loaded/i);
    });
  });

  describe('when collection cache is loaded via query', function() {
    beforeEach(function(done) {
      this.student.courseObjects.fetch().then(function() { done(); }, done);
    });

    it('caches the relevant related objects', function() {
      expect(_.map(this.student.courses, 'attrs')).to.eql([
        { id: 3, subject: 'CS 101' },
        { id: 9, subject: 'History 101' },
      ]);
    });

    it('does not load the inverse cache', function() {
      var course = this.student.courses[0];
      expect(function() {
        course.students;
      }.bind(this)).to.throw(/students.*not yet.*loaded/i);
    });

    describe('when adding existing object to the relationship', function() {
      beforeEach(function() { this.course.addStudent(this.student); });

      it('adds to the collection cache', function() {
        expect(this.student.courses).to.contain(this.course);
      });
    });

    describe('when removing existing object', function() {
      beforeEach(function(done) {
        this.course.studentObjects
          .with('courses')
          .execute()
          .bind(this)
          .then(function(students) { this.student = students[0]; })
          .done(done, done);
      });

      beforeEach(function() {
        this.course.removeStudent(this.student);
      });

      it('removes from the collection cache', function() {
        expect(this.student.courses).to.not.contain(this.course);
      });
    });
  });

  describe('when adding existing object via belongsTo', function() {
    beforeEach(function() { this.student.addCourse(this.course); });

    it('does not load the collection cache', function() {
      expect(function() {
        this.student.courses;
      }.bind(this)).to.throw(/courses.*not yet.*loaded/i);
    });
  });

  describe('when adding created object', function() {
    beforeEach(function() {
      this.course = Course.create({ subject: 'English' });
      this.student.addCourse(this.course);
    });

    it('adds to the collection cache', function() {
      expect(this.course.students).to.contain(this.student);
    });
  });

  describe('when adding unsaved object via belongsTo', function() {
    beforeEach(function() {
      this.course.subject = 'Math';
      this.student.addCourse(this.course);
    });

    it('does not load the collection cache', function() {
      expect(function() {
        this.student.courses;
      }.bind(this)).to.throw(/courses.*not yet.*loaded/i);
    });
  });

});
