/**
 * Udemy DRM Downloader — Background Service Worker (Manifest V3)
 *
 * Handles two download actions:
 *   DOWNLOAD_VIDEO    – downloads a direct CDN MP4 URL via chrome.downloads
 *   DOWNLOAD_SUBTITLE – fetches WebVTT, converts to SRT, saves via data-URI download
 */

import { vttToSrt, createSrtDataUri } from './utils/subtitle-utils.js';
import { buildDownloadPath }           from './utils/filename-utils.js';

/**
 * Downloads a direct-CDN video URL via Chrome Downloads API.
 * The URL comes from Udemy's API (media_sources / stream_urls / download_urls),
 * NOT from the blob: MediaSource player.
 */
export async function downloadVideoStream({
  videoUrl,
  courseId,
  courseTitle,
  lectureTitle,
  lectureIndex,
  quality
}) {
  if (!videoUrl) throw new Error('No video URL provided for download.');

  const filename = buildDownloadPath({
    courseId,
    courseTitle,
    lectureTitle,
    lectureIndex,
    extension: 'mp4'
  });

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: videoUrl, filename, conflictAction: 'uniquify', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error('Download failed to start.'));
        } else {
          console.log(`[UdemyDownloader] Video download started — ID ${downloadId}, quality ${quality || '?'}`);
          resolve(downloadId);
        }
      }
    );
  });
}

/**
 * Fetches WebVTT subtitle, converts to SRT, triggers chrome.downloads with a data-URI.
 */
export async function downloadSubtitleTrack({
  subtitleUrl,
  lang = 'en',
  courseId,
  courseTitle,
  lectureTitle,
  lectureIndex
}) {
  if (!subtitleUrl) throw new Error('Subtitle URL is required.');

  const response = await fetch(subtitleUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch subtitle: HTTP ${response.status} ${response.statusText}`);
  }
  const vttText = await response.text();

  const srtText = vttToSrt(vttText);
  if (!srtText) throw new Error('Converted SRT content is empty.');

  const dataUri = createSrtDataUri(srtText);

  const filename = buildDownloadPath({
    courseId,
    courseTitle,
    lectureTitle,
    lectureIndex,
    extension: `${lang.toLowerCase()}.srt`,
    subfolder: 'subtitles'
  });

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: dataUri, filename, conflictAction: 'uniquify', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error('Subtitle download failed to start.'));
        } else {
          console.log(`[UdemyDownloader] Subtitle (${lang}) download started — ID ${downloadId}`);
          resolve(downloadId);
        }
      }
    );
  });
}

/**
 * Main message dispatcher.
 */
export async function handleDownloadRequest(request) {
  const { action, payload } = request;

  switch (action) {
    case 'DOWNLOAD_VIDEO': {
      const downloadId = await downloadVideoStream(payload);
      return { success: true, downloadId, type: 'video' };
    }
    case 'DOWNLOAD_SUBTITLE': {
      const downloadId = await downloadSubtitleTrack(payload);
      return { success: true, downloadId, type: 'subtitle' };
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

// Register listener in extension context
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Only handle background-specific actions (downloads).
    // FETCH_STREAMS / GET_LECTURE_DATA are handled by the content script.
    if (message.action === 'DOWNLOAD_VIDEO' || message.action === 'DOWNLOAD_SUBTITLE') {
      handleDownloadRequest(message)
        .then(res  => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
}
