/**
 * Udemy Content Script Parser (v2)
 *
 * Injected into Udemy course pages.  On load it does a lightweight DOM scan;
 * on demand (popup "Scan" button → FETCH_STREAMS message) it calls Udemy's
 * internal REST API to discover direct CDN MP4 download URLs and subtitle
 * tracks — completely bypassing the blob: MediaSource player.
 */

import { parseUdemyUrl, extractCourseInfoFromDom } from '../utils/parser-utils.js';
import {
  resolveNumericCourseId,
  fetchLectureAssets,
  extractDownloadableStreams
} from '../utils/udemy-api.js';

// ---------------------------------------------------------------------------
// Lightweight DOM scan (runs automatically on page load / SPA navigation)
// ---------------------------------------------------------------------------

/**
 * Quick DOM-only scan — no network calls.
 * @param {Document} doc
 * @param {string}   currentUrl
 * @returns {Object}
 */
export function scrapeUdemyPage(doc = document, currentUrl = window?.location?.href || '') {
  const courseInfo = extractCourseInfoFromDom(doc, currentUrl);

  return {
    courseId: courseInfo.courseId,
    courseSlug: courseInfo.courseSlug,
    courseTitle: courseInfo.courseTitle,
    lectureId: courseInfo.lectureId,
    lectureTitle: courseInfo.lectureTitle,
    // These will be filled in by the API call later:
    videos: [],
    subtitles: [],
    primaryVideoUrl: null,
    isDrmProtected: false,
    streamStatus: 'NOT_SCANNED',
    streamStatusLabel: 'Not scanned yet',
    streamStatusColor: '#95a5a6',
    scrapedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// API-based stream discovery (runs on demand via FETCH_STREAMS message)
// ---------------------------------------------------------------------------

/**
 * Calls Udemy's API to fetch real direct-download video URLs and subtitles.
 * @param {Object} pageInfo - Basic page info from scrapeUdemyPage
 * @returns {Promise<Object>} Enriched data with video streams and subtitles
 */
export async function fetchStreamsFromApi(pageInfo) {
  const data = { ...pageInfo };

  // 1. Resolve numeric courseId if we only have a slug
  let numericCourseId = data.courseId;

  if (!numericCourseId && data.courseSlug) {
    const resolved = await resolveNumericCourseId(data.courseSlug);
    numericCourseId = String(resolved.id);
    data.courseId = numericCourseId;
    if (!data.courseTitle || data.courseTitle === 'Udemy Course') {
      data.courseTitle = resolved.title;
    }
  }

  if (!numericCourseId) {
    data.streamStatus = 'ERROR';
    data.streamStatusLabel = 'No course ID found';
    data.streamStatusColor = '#e74c3c';
    return data;
  }

  if (!data.lectureId) {
    data.streamStatus = 'NO_LECTURE';
    data.streamStatusLabel = 'No lecture ID in URL';
    data.streamStatusColor = '#f39c12';
    return data;
  }

  // 2. Fetch lecture assets from API
  const apiResponse = await fetchLectureAssets(numericCourseId, data.lectureId);
  const streams = extractDownloadableStreams(apiResponse);

  data.videos = streams.videos;
  data.subtitles = streams.subtitles;
  data.isDrmProtected = streams.isDrmProtected;
  data.lectureIndex = streams.lectureIndex;

  if (streams.lectureTitle) {
    data.lectureTitle = streams.lectureTitle;
  }

  // 3. Pick primary video (highest quality)
  if (data.videos.length > 0) {
    data.primaryVideoUrl = data.videos[0].url;
    data.streamStatus = 'READY';
    data.streamStatusLabel = `${data.videos.length} quality option${data.videos.length > 1 ? 's' : ''} found`;
    data.streamStatusColor = '#2ecc71';
  } else if (data.isDrmProtected) {
    data.streamStatus = 'DRM_ONLY';
    data.streamStatusLabel = 'DRM Protected — no direct MP4';
    data.streamStatusColor = '#e74c3c';
  } else {
    data.streamStatus = 'NO_STREAMS';
    data.streamStatusLabel = 'No downloadable streams found';
    data.streamStatusColor = '#e67e22';
  }

  data.scrapedAt = new Date().toISOString();
  return data;
}

// ---------------------------------------------------------------------------
// Storage sync
// ---------------------------------------------------------------------------

/** @param {Object} data */
export async function syncStorage(data) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ udemyCurrentLecture: data });
      console.log('[UdemyDownloader] Storage synced:', data.lectureTitle, data.streamStatus);
    } catch (err) {
      console.warn('[UdemyDownloader] Storage sync failed:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Content-script lifecycle
// ---------------------------------------------------------------------------

export function initContentScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Lightweight initial DOM scan (no network)
  setTimeout(() => {
    const data = scrapeUdemyPage(document, window.location.href);
    syncStorage(data);
  }, 800);

  // Message handler
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'GET_LECTURE_DATA') {
        // Quick DOM-only scan
        const data = scrapeUdemyPage(document, window.location.href);
        syncStorage(data);
        sendResponse({ success: true, data });
        return true;
      }

      if (message.action === 'FETCH_STREAMS') {
        // Full API-based scan — async
        const pageInfo = scrapeUdemyPage(document, window.location.href);
        fetchStreamsFromApi(pageInfo)
          .then(enriched => {
            syncStorage(enriched);
            sendResponse({ success: true, data: enriched });
          })
          .catch(err => {
            sendResponse({ success: false, error: err.message });
          });
        return true; // keep channel open
      }
    });
  }

  // SPA navigation observer
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(() => {
        const data = scrapeUdemyPage(document, window.location.href);
        syncStorage(data);
      }, 1200);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Auto-run in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initContentScript();
}
