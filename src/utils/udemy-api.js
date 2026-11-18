/**
 * Udemy API Interaction Layer
 * 
 * Calls Udemy's internal REST API (v2.0) from the content script context
 * to discover direct CDN video download URLs and subtitle tracks.
 * 
 * The content script runs on udemy.com pages with the user's session cookies,
 * so authenticated API calls work without any extra credential handling.
 */

/**
 * Reads a named cookie from a cookie string.
 * @param {string} name - Cookie name
 * @param {string} [cookieString] - Cookie string; defaults to document.cookie
 * @returns {string|null}
 */
export function getCookie(name, cookieString) {
  const str = cookieString !== undefined
    ? cookieString
    : (typeof document !== 'undefined' ? document.cookie : '');
  if (!str || !name) return null;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = str.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Returns the origin API calls should target.
 *
 * Udemy Business accounts live on an organisation subdomain (e.g.
 * https://acme.udemy.com) and their session cookies are scoped to it, so
 * calling www.udemy.com from there is cross-origin and unauthenticated (403).
 * Prefer the current page's origin when it is a udemy.com host.
 *
 * @param {string} [pageOrigin] - Override for testing; defaults to location.origin
 * @returns {string}
 */
export function getApiOrigin(pageOrigin) {
  const origin = pageOrigin !== undefined
    ? pageOrigin
    : (typeof location !== 'undefined' ? location.origin : '');
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === 'https:' && /(^|\.)udemy\.com$/i.test(hostname)) {
      return `https://${hostname}`;
    }
  } catch {
    // fall through to default
  }
  return 'https://www.udemy.com';
}

/**
 * Reads a short, single-line snippet of an error response body for diagnostics.
 * Never throws.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function readErrorSnippet(res) {
  try {
    const text = await res.text();
    return text.replace(/\s+/g, ' ').trim().slice(0, 160);
  } catch {
    return '';
  }
}

/**
 * Builds standard headers for Udemy API calls.
 * @param {string} [cookieString] - Optional cookie string for testing
 * @returns {Object} Headers object
 */
export function buildApiHeaders(cookieString) {
  const headers = { 'Accept': 'application/json' };
  const csrf = getCookie('csrftoken', cookieString);
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

/**
 * Resolves a course slug (e.g. "complete-python-bootcamp") to its numeric ID.
 * @param {string} courseSlug
 * @returns {Promise<{id: number, title: string}>}
 */
export async function resolveNumericCourseId(courseSlug) {
  if (!courseSlug) throw new Error('Course slug is required');

  const url = `${getApiOrigin()}/api-2.0/courses/${encodeURIComponent(courseSlug)}/?fields[course]=id,title`;
  const res = await fetch(url, { headers: buildApiHeaders(), credentials: 'include' });

  if (res.status === 403) {
    const detail = await readErrorSnippet(res);
    throw new Error(`Access denied for course "${courseSlug}". Make sure you are logged in.${detail ? ` [HTTP 403: ${detail}]` : ''}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to resolve course "${courseSlug}": HTTP ${res.status}`);
  }
  const data = await res.json();
  return { id: data.id, title: data.title || courseSlug };
}

/**
 * Fetches lecture asset data (video streams, subtitles, DRM info) from Udemy's API.
 * Must be called from a content script on a udemy.com page (needs session cookies).
 * 
 * @param {string|number} courseId - Numeric course ID
 * @param {string|number} lectureId - Numeric lecture ID
 * @returns {Promise<Object>} Raw API response
 */
export async function fetchLectureAssets(courseId, lectureId) {
  if (!courseId || !lectureId) {
    throw new Error('Both courseId and lectureId are required');
  }

  const fields = [
    'fields[lecture]=asset,title,object_index',
    'fields[asset]=stream_urls,download_urls,captions,title,filename,media_sources,media_license_token,course_is_drmed,asset_type'
  ].join('&');

  const url = `${getApiOrigin()}/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?${fields}`;
  const res = await fetch(url, { headers: buildApiHeaders(), credentials: 'include' });

  if (res.status === 403) {
    const detail = await readErrorSnippet(res);
    throw new Error(`Access denied. Make sure you are enrolled in this course and logged in to Udemy.${detail ? ` [HTTP 403: ${detail}]` : ''}`);
  }
  if (res.status === 404) {
    throw new Error('Lecture not found. The course or lecture ID may be incorrect.');
  }
  if (!res.ok) {
    throw new Error(`Udemy API error: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Extracts downloadable video streams and subtitle tracks from an API response.
 * Pure function — no side effects, fully testable.
 * 
 * @param {Object} apiResponse - Raw response from fetchLectureAssets
 * @returns {Object} Structured streams: { videos, subtitles, isDrmProtected, lectureTitle, lectureIndex }
 */
export function extractDownloadableStreams(apiResponse) {
  const result = {
    videos: [],
    subtitles: [],
    isDrmProtected: false,
    lectureTitle: '',
    lectureIndex: null,
    assetTitle: ''
  };

  if (!apiResponse) return result;

  result.lectureTitle = apiResponse.title || '';
  result.lectureIndex = apiResponse.object_index ?? null;

  const asset = apiResponse.asset;
  if (!asset) return result;

  result.assetTitle = asset.title || '';
  result.isDrmProtected = !!(asset.media_license_token || asset.course_is_drmed);

  // Priority 1: media_sources — most reliable, contains direct CDN MP4 URLs
  if (Array.isArray(asset.media_sources)) {
    for (const src of asset.media_sources) {
      if (src.type === 'video/mp4' && src.src) {
        result.videos.push({
          url: src.src,
          quality: String(src.label || '0'),
          mimeType: 'video/mp4',
          label: `${src.label || '?'}p`
        });
      }
    }
  }

  // Priority 2: stream_urls.Video
  if (result.videos.length === 0 && asset.stream_urls) {
    const streams = asset.stream_urls.Video || asset.stream_urls.video || [];
    for (const s of (Array.isArray(streams) ? streams : [])) {
      if (s.file && s.type === 'video/mp4') {
        result.videos.push({
          url: s.file,
          quality: String(s.label || '0'),
          mimeType: 'video/mp4',
          label: `${s.label || '?'}p`
        });
      }
    }
  }

  // Priority 3: download_urls.Video (instructor-enabled downloads)
  if (result.videos.length === 0 && asset.download_urls) {
    const dls = asset.download_urls.Video || asset.download_urls.video || [];
    for (const d of (Array.isArray(dls) ? dls : [])) {
      if (d.file) {
        result.videos.push({
          url: d.file,
          quality: String(d.label || '0'),
          mimeType: 'video/mp4',
          label: `${d.label || '?'}p`
        });
      }
    }
  }

  // Sort by quality descending (1080 > 720 > 480 > 360)
  result.videos.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

  // Extract subtitles / captions
  if (Array.isArray(asset.captions)) {
    for (const cap of asset.captions) {
      if (cap.url) {
        result.subtitles.push({
          url: cap.url,
          lang: (cap.locale_id || 'en').split('_')[0].toLowerCase(),
          label: cap.title || cap.locale_id || 'Unknown',
          locale: cap.locale_id || ''
        });
      }
    }
  }

  return result;
}

/**
 * Picks the best video stream matching a preferred quality.
 * @param {Array} videos - Videos from extractDownloadableStreams
 * @param {string} [preferredQuality='highest'] - 'highest', 'lowest', '1080', '720', '480', '360'
 * @returns {Object|null}
 */
export function findBestVideoStream(videos, preferredQuality = 'highest') {
  if (!Array.isArray(videos) || videos.length === 0) return null;
  if (preferredQuality === 'highest') return videos[0];
  if (preferredQuality === 'lowest') return videos[videos.length - 1];

  const target = parseInt(preferredQuality);
  if (isNaN(target)) return videos[0];

  // Exact match first
  const exact = videos.find(v => parseInt(v.quality) === target);
  if (exact) return exact;

  // Closest match
  return videos.reduce((best, v) => {
    const bestDiff = Math.abs(parseInt(best.quality) - target);
    const vDiff = Math.abs(parseInt(v.quality) - target);
    return vDiff < bestDiff ? v : best;
  });
}
