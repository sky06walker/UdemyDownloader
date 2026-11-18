import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUdemyUrl,
  extractCourseInfoFromDom,
  extractMediaFromDom,
  cleanManifestUrl
} from '../src/utils/parser-utils.js';

test('parseUdemyUrl - parses lecture URL with slug and numeric lecture ID', () => {
  const url = 'https://www.udemy.com/course/complete-python-bootcamp/learn/lecture/12345678#overview';
  const parsed = parseUdemyUrl(url);

  assert.equal(parsed.courseSlug, 'complete-python-bootcamp');
  assert.equal(parsed.lectureId, '12345678');
});

test('parseUdemyUrl - parses course overview URL', () => {
  const url = 'https://www.udemy.com/course/machine-learning-az/';
  const parsed = parseUdemyUrl(url);

  assert.equal(parsed.courseSlug, 'machine-learning-az');
  assert.equal(parsed.lectureId, null);
});

test('parseUdemyUrl - handles numeric course IDs in URL path', () => {
  const url = 'https://www.udemy.com/course/9876543/learn/lecture/112233';
  const parsed = parseUdemyUrl(url);

  assert.equal(parsed.courseId, '9876543');
  assert.equal(parsed.lectureId, '112233');
});

test('parseUdemyUrl - handles query params for course_id and lecture_id', () => {
  const url = 'https://www.udemy.com/course-dashboard-redirect/?course_id=555&lecture_id=777';
  const parsed = parseUdemyUrl(url);

  assert.equal(parsed.courseId, '555');
  assert.equal(parsed.lectureId, '777');
});

test('parseUdemyUrl - handles null and invalid inputs gracefully', () => {
  const parsed = parseUdemyUrl(null);
  assert.equal(parsed.courseSlug, null);
  assert.equal(parsed.courseId, null);
  assert.equal(parsed.lectureId, null);
});

test('extractCourseInfoFromDom - extracts course and lecture titles from DOM elements', () => {
  const mockDoc = {
    location: { href: 'https://www.udemy.com/course/python-course/learn/lecture/999' },
    querySelector: (sel) => {
      if (sel === '[data-purpose="lead-title"]') {
        return { textContent: 'Mastering Python 3' };
      }
      if (sel === '[data-purpose="item-title"]') {
        return { textContent: 'Variables and Expressions' };
      }
      if (sel === '[data-course-id]') {
        return { getAttribute: (attr) => (attr === 'data-course-id' ? '445566' : null) };
      }
      return null;
    }
  };

  const info = extractCourseInfoFromDom(mockDoc);

  assert.equal(info.courseTitle, 'Mastering Python 3');
  assert.equal(info.lectureTitle, 'Variables and Expressions');
  assert.equal(info.lectureId, '999');
  assert.equal(info.courseId, '445566');
});

test('extractCourseInfoFromDom - falls back to document.title when DOM tags missing', () => {
  const mockDoc = {
    title: 'Docker Masterclass | Udemy',
    location: { href: 'https://www.udemy.com/course/docker-course/learn/lecture/123' },
    querySelector: () => null
  };

  const info = extractCourseInfoFromDom(mockDoc);

  assert.equal(info.courseTitle, 'Docker Masterclass');
  assert.equal(info.lectureId, '123');
});

test('extractMediaFromDom - extracts video source and tracks', () => {
  const mockDoc = {
    querySelectorAll: (sel) => {
      if (sel === 'video') {
        return [
          {
            getAttribute: (attr) => {
              if (attr === 'src') return 'https://stream.udemycdn.com/1080p.mp4';
              if (attr === 'type') return 'video/mp4';
              if (attr === 'data-drm') return 'true';
              return null;
            }
          }
        ];
      }
      if (sel === 'source') {
        return [];
      }
      if (sel === 'track') {
        return [
          {
            getAttribute: (attr) => {
              if (attr === 'kind') return 'subtitles';
              if (attr === 'src') return 'https://subs.udemycdn.com/en.vtt';
              if (attr === 'srclang') return 'en';
              if (attr === 'label') return 'English';
              return null;
            }
          }
        ];
      }
      return [];
    }
  };

  const media = extractMediaFromDom(mockDoc);

  assert.equal(media.videoSources.length, 1);
  assert.equal(media.videoSources[0].url, 'https://stream.udemycdn.com/1080p.mp4');
  assert.equal(media.hasDrmIndicators, true);

  assert.equal(media.subtitles.length, 1);
  assert.equal(media.subtitles[0].lang, 'en');
  assert.equal(media.subtitles[0].label, 'English');
  assert.equal(media.subtitles[0].url, 'https://subs.udemycdn.com/en.vtt');
});

test('cleanManifestUrl - removes hash fragments from URL', () => {
  const dirty = 'https://stream.udemycdn.com/manifest.mpd#token=xyz&t=10';
  const clean = cleanManifestUrl(dirty);
  assert.equal(clean, 'https://stream.udemycdn.com/manifest.mpd');
});
