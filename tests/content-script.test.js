import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapeUdemyPage, syncStorage } from '../src/inject/udemy-parser.js';

test('scrapeUdemyPage - extracts comprehensive page and media state', () => {
  const mockDoc = {
    location: { href: 'https://www.udemy.com/course/complete-react-guide/learn/lecture/889900' },
    querySelector: (sel) => {
      if (sel === '[data-purpose="lead-title"]') return { textContent: 'React - The Complete Guide' };
      if (sel === '[data-purpose="item-title"]') return { textContent: 'Components & JSX' };
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'video') {
        return [
          {
            getAttribute: (attr) => {
              if (attr === 'src') return 'https://stream.udemycdn.com/react_lecture_1080p.mp4';
              if (attr === 'type') return 'video/mp4';
              return null;
            }
          }
        ];
      }
      if (sel === 'source') return [];
      if (sel === 'track') {
        return [
          {
            getAttribute: (attr) => {
              if (attr === 'src') return 'https://subs.udemycdn.com/en_sub.vtt';
              if (attr === 'kind') return 'subtitles';
              if (attr === 'srclang') return 'en';
              if (attr === 'label') return 'English [CC]';
              return null;
            }
          }
        ];
      }
      return [];
    }
  };

  const result = scrapeUdemyPage(mockDoc, mockDoc.location.href);

  assert.equal(result.courseSlug, 'complete-react-guide');
  assert.equal(result.lectureId, '889900');
  assert.equal(result.courseTitle, 'React - The Complete Guide');
  assert.equal(result.lectureTitle, 'Components & JSX');
  assert.equal(result.primaryVideoUrl, 'https://stream.udemycdn.com/react_lecture_1080p.mp4');
  assert.equal(result.streamAnalysis.type, 'DIRECT_MP4');
  assert.equal(result.streamAnalysis.isDirectDownloadable, true);
  assert.equal(result.subtitles.length, 1);
  assert.equal(result.subtitles[0].lang, 'en');
});

test('syncStorage - calls chrome.storage.local.set with structured payload', async () => {
  let stored = null;
  globalThis.chrome = {
    storage: {
      local: {
        set: async (items) => {
          stored = items;
        }
      }
    }
  };

  const sampleData = {
    courseId: '42',
    courseTitle: 'Node.js Mastery',
    lectureTitle: 'Event Loop',
    primaryVideoUrl: 'https://example.com/video.mp4',
    subtitles: [],
    streamAnalysis: { isDirectDownloadable: true }
  };

  await syncStorage(sampleData);

  assert.ok(stored);
  assert.equal(stored.udemyCourseId, '42');
  assert.equal(stored.udemyTitle, 'Node.js Mastery');
  assert.equal(stored.udemyLectureTitle, 'Event Loop');
  assert.equal(stored.udemyVideoUrl, 'https://example.com/video.mp4');
});
