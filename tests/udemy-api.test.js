import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCookie,
  buildApiHeaders,
  getApiOrigin,
  fetchLectureAssets,
  extractDownloadableStreams,
  findBestVideoStream
} from '../src/utils/udemy-api.js';

// ── getApiOrigin / fetchLectureAssets ───────────────────────────────────────

test('getApiOrigin - uses Udemy Business org subdomain when on one', () => {
  assert.equal(getApiOrigin('https://acme.udemy.com'), 'https://acme.udemy.com');
});

test('getApiOrigin - keeps www.udemy.com for the consumer site', () => {
  assert.equal(getApiOrigin('https://www.udemy.com'), 'https://www.udemy.com');
});

test('getApiOrigin - rejects non-udemy, non-https and look-alike origins', () => {
  assert.equal(getApiOrigin('https://evil-udemy.com'), 'https://www.udemy.com');
  assert.equal(getApiOrigin('https://udemy.com.evil.io'), 'https://www.udemy.com');
  assert.equal(getApiOrigin('http://acme.udemy.com'), 'https://www.udemy.com');
  assert.equal(getApiOrigin(''), 'https://www.udemy.com');
});

test('fetchLectureAssets - calls the page origin and surfaces 403 detail', async () => {
  let calledUrl;
  globalThis.fetch = async (url) => {
    calledUrl = url;
    return { status: 403, ok: false, text: async () => 'Just a moment...' };
  };
  const origLocation = globalThis.location;
  globalThis.location = { origin: 'https://acme.udemy.com' };
  try {
    await assert.rejects(
      () => fetchLectureAssets('111', '222'),
      /Access denied.*HTTP 403: Just a moment/
    );
    assert.ok(calledUrl.startsWith('https://acme.udemy.com/api-2.0/users/me/subscribed-courses/111/lectures/222/'));
  } finally {
    globalThis.location = origLocation;
    delete globalThis.fetch;
  }
});

// ── getCookie ───────────────────────────────────────────────────────────────

test('getCookie - extracts named cookie from cookie string', () => {
  const cookies = 'csrftoken=abc123; session_id=xyz789; _ga=GA1.2.111';
  assert.equal(getCookie('csrftoken', cookies), 'abc123');
  assert.equal(getCookie('session_id', cookies), 'xyz789');
  assert.equal(getCookie('_ga', cookies), 'GA1.2.111');
});

test('getCookie - returns null for missing cookie', () => {
  assert.equal(getCookie('missing', 'csrftoken=abc'), null);
});

test('getCookie - returns null for empty / null inputs', () => {
  assert.equal(getCookie('x', ''), null);
  assert.equal(getCookie('', 'a=b'), null);
  assert.equal(getCookie(null, 'a=b'), null);
});

test('getCookie - decodes URI-encoded values', () => {
  const cookies = 'name=hello%20world';
  assert.equal(getCookie('name', cookies), 'hello world');
});

// ── buildApiHeaders ─────────────────────────────────────────────────────────

test('buildApiHeaders - includes CSRF token when cookie exists', () => {
  const headers = buildApiHeaders('csrftoken=TOKEN42; other=val');
  assert.equal(headers['Accept'], 'application/json');
  assert.equal(headers['X-CSRFToken'], 'TOKEN42');
});

test('buildApiHeaders - omits CSRF header when cookie missing', () => {
  const headers = buildApiHeaders('session_id=abc');
  assert.equal(headers['Accept'], 'application/json');
  assert.equal(headers['X-CSRFToken'], undefined);
});

// ── extractDownloadableStreams ───────────────────────────────────────────────

test('extractDownloadableStreams - extracts videos from media_sources', () => {
  const api = {
    title: 'Variables and Types',
    object_index: 5,
    asset: {
      title: 'variables.mp4',
      media_sources: [
        { type: 'video/mp4', src: 'https://cdn.udemy.com/720p.mp4', label: '720' },
        { type: 'video/mp4', src: 'https://cdn.udemy.com/1080p.mp4', label: '1080' },
        { type: 'video/mp4', src: 'https://cdn.udemy.com/480p.mp4', label: '480' },
        { type: 'application/x-mpegURL', src: 'https://cdn.udemy.com/master.m3u8', label: 'auto' }
      ],
      captions: [
        { url: 'https://cdn.udemy.com/en.vtt', locale_id: 'en_US', title: 'English [Auto]' },
        { url: 'https://cdn.udemy.com/es.vtt', locale_id: 'es_ES', title: 'Spanish' }
      ]
    }
  };

  const result = extractDownloadableStreams(api);

  assert.equal(result.lectureTitle, 'Variables and Types');
  assert.equal(result.lectureIndex, 5);
  assert.equal(result.isDrmProtected, false);

  // Should have 3 MP4 streams (HLS excluded), sorted 1080 > 720 > 480
  assert.equal(result.videos.length, 3);
  assert.equal(result.videos[0].quality, '1080');
  assert.equal(result.videos[1].quality, '720');
  assert.equal(result.videos[2].quality, '480');
  assert.equal(result.videos[0].url, 'https://cdn.udemy.com/1080p.mp4');

  // Subtitles
  assert.equal(result.subtitles.length, 2);
  assert.equal(result.subtitles[0].lang, 'en');
  assert.equal(result.subtitles[0].label, 'English [Auto]');
  assert.equal(result.subtitles[1].lang, 'es');
});

test('extractDownloadableStreams - falls back to stream_urls.Video', () => {
  const api = {
    title: 'Lecture 3',
    asset: {
      stream_urls: {
        Video: [
          { type: 'video/mp4', file: 'https://cdn/stream_360.mp4', label: '360' },
          { type: 'video/mp4', file: 'https://cdn/stream_720.mp4', label: '720' }
        ]
      },
      captions: []
    }
  };

  const result = extractDownloadableStreams(api);
  assert.equal(result.videos.length, 2);
  assert.equal(result.videos[0].quality, '720');
  assert.equal(result.videos[0].url, 'https://cdn/stream_720.mp4');
});

test('extractDownloadableStreams - falls back to download_urls.Video', () => {
  const api = {
    title: 'Lecture 4',
    asset: {
      download_urls: {
        Video: [
          { file: 'https://cdn/dl_1080.mp4', label: '1080' }
        ]
      },
      captions: []
    }
  };

  const result = extractDownloadableStreams(api);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].quality, '1080');
});

test('extractDownloadableStreams - detects DRM from media_license_token', () => {
  const api = {
    title: 'DRM Lecture',
    asset: {
      media_license_token: 'ey...jwt...',
      media_sources: [],
      captions: []
    }
  };

  const result = extractDownloadableStreams(api);
  assert.equal(result.isDrmProtected, true);
  assert.equal(result.videos.length, 0);
});

test('extractDownloadableStreams - detects DRM from course_is_drmed flag', () => {
  const api = {
    title: 'DRM Lecture 2',
    asset: {
      course_is_drmed: true,
      media_sources: [
        { type: 'video/mp4', src: 'https://cdn/clear_720.mp4', label: '720' }
      ],
      captions: []
    }
  };

  const result = extractDownloadableStreams(api);
  assert.equal(result.isDrmProtected, true);
  // Even DRM courses may have clear MP4 URLs via API
  assert.equal(result.videos.length, 1);
});

test('extractDownloadableStreams - returns empty arrays for null input', () => {
  const result = extractDownloadableStreams(null);
  assert.deepEqual(result.videos, []);
  assert.deepEqual(result.subtitles, []);
  assert.equal(result.isDrmProtected, false);
});

test('extractDownloadableStreams - handles missing asset gracefully', () => {
  const result = extractDownloadableStreams({ title: 'No asset' });
  assert.deepEqual(result.videos, []);
  assert.equal(result.lectureTitle, 'No asset');
});

// ── findBestVideoStream ─────────────────────────────────────────────────────

const sampleVids = [
  { url: 'a', quality: '1080', label: '1080p' },
  { url: 'b', quality: '720',  label: '720p'  },
  { url: 'c', quality: '480',  label: '480p'  },
  { url: 'd', quality: '360',  label: '360p'  }
];

test('findBestVideoStream - "highest" returns first (1080)', () => {
  const best = findBestVideoStream(sampleVids, 'highest');
  assert.equal(best.quality, '1080');
});

test('findBestVideoStream - "lowest" returns last (360)', () => {
  const best = findBestVideoStream(sampleVids, 'lowest');
  assert.equal(best.quality, '360');
});

test('findBestVideoStream - exact match "720"', () => {
  const best = findBestVideoStream(sampleVids, '720');
  assert.equal(best.quality, '720');
});

test('findBestVideoStream - closest match "700" → 720', () => {
  const best = findBestVideoStream(sampleVids, '700');
  assert.equal(best.quality, '720');
});

test('findBestVideoStream - returns null for empty array', () => {
  assert.equal(findBestVideoStream([], 'highest'), null);
  assert.equal(findBestVideoStream(null, 'highest'), null);
});
