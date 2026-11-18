import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDownloadRequest,
  downloadVideoStream,
  downloadSubtitleTrack
} from '../src/bg.js';

test('handleDownloadRequest - throws on unsupported action', async () => {
  await assert.rejects(
    () => handleDownloadRequest({ action: 'UNKNOWN_ACTION', payload: {} }),
    /Unsupported action/
  );
});

test('downloadVideoStream - rejects when no URL is provided', async () => {
  await assert.rejects(
    () => downloadVideoStream({}),
    /No video URL provided/
  );
});

test('downloadVideoStream - calls chrome.downloads.download for CDN URL', async () => {
  let passedOptions = null;
  globalThis.chrome = {
    runtime: { lastError: null },
    downloads: {
      download: (options, callback) => {
        passedOptions = options;
        callback(42);
      }
    }
  };

  const id = await downloadVideoStream({
    videoUrl: 'https://mp4-a.udemycdn.com/2026/video-1080.mp4?token=abc',
    courseId: '1001',
    courseTitle: 'React Course',
    lectureTitle: 'Hooks Explained',
    lectureIndex: 3,
    quality: '1080'
  });

  assert.equal(id, 42);
  assert.equal(passedOptions.url, 'https://mp4-a.udemycdn.com/2026/video-1080.mp4?token=abc');
  assert.ok(passedOptions.filename.includes('React Course'));
  assert.ok(passedOptions.filename.endsWith('.mp4'));
});

test('downloadSubtitleTrack - fetches VTT, converts to SRT, triggers download', async () => {
  const sampleVtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello world.
`;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => sampleVtt
  });

  let passedOptions = null;
  globalThis.chrome = {
    runtime: { lastError: null },
    downloads: {
      download: (options, callback) => {
        passedOptions = options;
        callback(84);
      }
    }
  };

  const id = await downloadSubtitleTrack({
    subtitleUrl: 'https://subs.udemycdn.com/en.vtt',
    lang: 'en',
    courseId: '1001',
    courseTitle: 'React Course',
    lectureTitle: 'Hooks Explained',
    lectureIndex: 3
  });

  assert.equal(id, 84);
  assert.ok(passedOptions.url.startsWith('data:text/plain;charset=utf-8;base64,'));
  assert.ok(passedOptions.filename.includes('subtitles'));
  assert.ok(passedOptions.filename.endsWith('.en.srt'));
});

test('downloadSubtitleTrack - rejects when subtitle URL missing', async () => {
  await assert.rejects(
    () => downloadSubtitleTrack({}),
    /Subtitle URL is required/
  );
});

test('handleDownloadRequest - DOWNLOAD_VIDEO dispatches correctly', async () => {
  globalThis.chrome = {
    runtime: { lastError: null },
    downloads: {
      download: (opts, cb) => cb(99)
    }
  };

  const res = await handleDownloadRequest({
    action: 'DOWNLOAD_VIDEO',
    payload: {
      videoUrl: 'https://cdn.udemy.com/720p.mp4',
      courseId: '100',
      courseTitle: 'Test',
      lectureTitle: 'Lec 1'
    }
  });

  assert.equal(res.success, true);
  assert.equal(res.downloadId, 99);
  assert.equal(res.type, 'video');
});
