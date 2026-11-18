import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStreamInfo,
  STREAM_TYPES
} from '../src/utils/drm-detector.js';

test('detectStreamInfo - detects direct MP4 by URL', () => {
  const result = detectStreamInfo({
    url: 'https://mpd-cdn.udemy.com/assets/video_1080p.mp4?token=123'
  });

  assert.equal(result.type, STREAM_TYPES.DIRECT_MP4);
  assert.equal(result.isDirectDownloadable, true);
  assert.equal(result.isDrmProtected, false);
});

test('detectStreamInfo - detects direct MP4 by MIME type', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/asset-1234',
    mimeType: 'video/mp4'
  });

  assert.equal(result.type, STREAM_TYPES.DIRECT_MP4);
  assert.equal(result.isDirectDownloadable, true);
});

test('detectStreamInfo - detects HLS stream', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/manifest.m3u8'
  });

  assert.equal(result.type, STREAM_TYPES.HLS);
  assert.equal(result.isDirectDownloadable, false);
  assert.equal(result.isDrmProtected, false);
});

test('detectStreamInfo - detects DASH manifest', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/manifest.mpd'
  });

  assert.equal(result.type, STREAM_TYPES.DASH);
  assert.equal(result.isDirectDownloadable, false);
});

test('detectStreamInfo - detects Widevine DRM from keySystem', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/video.mpd',
    keySystem: 'com.widevine.alpha'
  });

  assert.equal(result.type, STREAM_TYPES.WIDEVINE_DRM);
  assert.equal(result.isDrmProtected, true);
  assert.equal(result.isDirectDownloadable, false);
  assert.ok(result.message.includes('Widevine DRM'));
});

test('detectStreamInfo - detects Widevine DRM from hasDrmKey flag', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/video.mp4',
    hasDrmKey: true
  });

  assert.equal(result.type, STREAM_TYPES.WIDEVINE_DRM);
  assert.equal(result.isDrmProtected, true);
});

test('detectStreamInfo - detects Widevine DRM from URL indicators', () => {
  const result = detectStreamInfo({
    url: 'https://stream.udemycdn.com/drm/cenc/manifest.mpd'
  });

  assert.equal(result.type, STREAM_TYPES.WIDEVINE_DRM);
  assert.equal(result.isDrmProtected, true);
});

test('detectStreamInfo - detects MediaSource in-memory blob URL', () => {
  const result = detectStreamInfo({
    url: 'blob:https://www.udemy.com/12345678-abcd-ef01-2345-6789abcdef01'
  });

  assert.equal(result.type, STREAM_TYPES.BLOB_STREAM);
  assert.equal(result.isDirectDownloadable, false);
  assert.ok(result.message.includes('blob: URL'));
});

test('detectStreamInfo - returns UNKNOWN for empty or unrecognized stream', () => {
  const result = detectStreamInfo();
  assert.equal(result.type, STREAM_TYPES.UNKNOWN);
  assert.equal(result.isDirectDownloadable, false);
  assert.equal(result.isDrmProtected, false);
});
