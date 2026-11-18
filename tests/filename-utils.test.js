import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFilename,
  buildDownloadPath
} from '../src/utils/filename-utils.js';

test('sanitizeFilename - removes illegal Windows/Unix characters', () => {
  const dirty = 'Intro: What is Python? / Step <1> *Important* | Part "A"';
  const clean = sanitizeFilename(dirty);
  assert.ok(!/[<>:"/\\|?*]/.test(clean));
  assert.equal(clean, 'Intro_ What is Python_ _ Step _1_ _Important_ _ Part _A');
});

test('sanitizeFilename - trims leading and trailing spaces, dots, underscores', () => {
  const dirty = ' ...__Lecture Name__... ';
  const clean = sanitizeFilename(dirty);
  assert.equal(clean, 'Lecture Name');
});

test('sanitizeFilename - handles Windows reserved names (CON, PRN, AUX, NUL)', () => {
  assert.equal(sanitizeFilename('CON'), 'CON_file');
  assert.equal(sanitizeFilename('prn'), 'prn_file');
  assert.equal(sanitizeFilename('aux'), 'aux_file');
  assert.equal(sanitizeFilename('NUL'), 'NUL_file');
});

test('sanitizeFilename - truncates to max length', () => {
  const longName = 'A'.repeat(150);
  const clean = sanitizeFilename(longName, '_', 50);
  assert.equal(clean.length, 50);
});

test('sanitizeFilename - handles empty, null, and non-string inputs', () => {
  assert.equal(sanitizeFilename(''), 'untitled');
  assert.equal(sanitizeFilename(null), 'untitled');
  assert.equal(sanitizeFilename(undefined), 'untitled');
  assert.equal(sanitizeFilename('   ???   '), 'untitled');
});

test('buildDownloadPath - creates organized video download path', () => {
  const path = buildDownloadPath({
    courseId: '123456',
    courseTitle: 'Complete Python Bootcamp: From Zero to Hero',
    lectureIndex: 3,
    lectureTitle: 'Installing Python & VS Code',
    extension: 'mp4'
  });

  assert.equal(
    path,
    'UdemyDownloads/123456_Complete Python Bootcamp_ From Zero to Hero/03_Installing Python & VS Code.mp4'
  );
});

test('buildDownloadPath - handles subtitles subfolder', () => {
  const path = buildDownloadPath({
    courseId: '987654',
    courseTitle: 'Modern JavaScript',
    lectureIndex: 1,
    lectureTitle: 'Welcome to the Course',
    extension: 'en.srt',
    subfolder: 'subtitles'
  });

  assert.equal(
    path,
    'UdemyDownloads/987654_Modern JavaScript/subtitles/01_Welcome to the Course.en.srt'
  );
});

test('buildDownloadPath - works with missing optional params', () => {
  const path = buildDownloadPath();
  assert.ok(path.startsWith('UdemyDownloads/Udemy Course/Lecture.mp4'));
});
