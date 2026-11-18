/**
 * Udemy Page & Media Parser Utilities.
 */

/**
 * Extracts course slug, course ID, and lecture ID from a Udemy URL or pathname.
 * Handles paths such as:
 * - https://www.udemy.com/course/python-masterclass/learn/lecture/12345678#overview
 * - https://www.udemy.com/course-dashboard-redirect/?course_id=98765
 * - /course/complete-web-developer/learn/lecture/555444333
 * - https://udemy.com/course/1234567/
 * 
 * @param {string} urlString - Full URL or path string
 * @returns {Object} Extracted identifiers { courseSlug, courseId, lectureId }
 */
export function parseUdemyUrl(urlString) {
  const result = {
    courseSlug: null,
    courseId: null,
    lectureId: null
  };

  if (!urlString || typeof urlString !== 'string') {
    return result;
  }

  try {
    // Handle both full URLs and relative paths
    const url = urlString.startsWith('http') 
      ? new URL(urlString) 
      : new URL(urlString, 'https://www.udemy.com');

    const pathname = url.pathname;

    // Pattern 1: /course/<slug>/learn/lecture/<lectureId>
    const lectureMatch = pathname.match(/\/course\/([^/]+)\/learn\/lecture\/(\d+)/i);
    if (lectureMatch) {
      result.courseSlug = lectureMatch[1];
      result.lectureId = lectureMatch[2];
      // Sometimes courseSlug is a numeric ID
      if (/^\d+$/.test(result.courseSlug)) {
        result.courseId = result.courseSlug;
      }
    } else {
      // Pattern 2: /course/<slug>
      const courseMatch = pathname.match(/\/course\/([^/]+)/i);
      if (courseMatch) {
        result.courseSlug = courseMatch[1];
        if (/^\d+$/.test(result.courseSlug)) {
          result.courseId = result.courseSlug;
        }
      }
    }

    // Pattern 3: query params (e.g. ?course_id=12345, ?lecture_id=6789)
    const paramCourseId = url.searchParams.get('course_id') || url.searchParams.get('courseId');
    if (paramCourseId) {
      result.courseId = paramCourseId;
    }

    const paramLectureId = url.searchParams.get('lecture_id') || url.searchParams.get('lectureId');
    if (paramLectureId) {
      result.lectureId = paramLectureId;
    }
  } catch {
    // Fallback regex if URL constructor fails
    const matchLecture = urlString.match(/lecture\/(\d+)/i);
    if (matchLecture) result.lectureId = matchLecture[1];

    const matchCourse = urlString.match(/course\/([^/?#]+)/i);
    if (matchCourse) result.courseSlug = matchCourse[1];
  }

  return result;
}

/**
 * Extracts course and lecture metadata from a DOM-like structure.
 * 
 * @param {Object} doc - Document object or mock document
 * @param {string} [currentUrl=''] - Optional current page URL
 * @returns {Object} Extracted course metadata
 */
export function extractCourseInfoFromDom(doc, currentUrl = '') {
  const result = {
    courseId: null,
    courseSlug: null,
    courseTitle: 'Udemy Course',
    lectureId: null,
    lectureTitle: 'Lecture',
    lectureIndex: null
  };

  if (!doc) return result;

  // 1. Try URL parsing first
  const pageUrl = currentUrl || (doc.location ? doc.location.href : '');
  const urlParsed = parseUdemyUrl(pageUrl);
  if (urlParsed.courseSlug) result.courseSlug = urlParsed.courseSlug;
  if (urlParsed.courseId) result.courseId = urlParsed.courseId;
  if (urlParsed.lectureId) result.lectureId = urlParsed.lectureId;

  // Helper query selector
  const q = (sel) => {
    try {
      const el = doc.querySelector(sel);
      return el ? (el.textContent || el.innerText || '').trim() : null;
    } catch {
      return null;
    }
  };

  const getAttr = (sel, attr) => {
    try {
      const el = doc.querySelector(sel);
      return el && el.getAttribute ? el.getAttribute(attr) : null;
    } catch {
      return null;
    }
  };

  // 2. Extract Course Title
  const courseTitleSelectors = [
    '[data-purpose="course-header-title"]',
    '[data-purpose="lead-title"]',
    'h1[data-purpose="course-title"]',
    '.clp-lead__title',
    'h1.page-title',
    '.header--course-title'
  ];

  for (const sel of courseTitleSelectors) {
    const title = q(sel);
    if (title) {
      result.courseTitle = title;
      break;
    }
  }

  // Fallback to meta tags or document title
  if (result.courseTitle === 'Udemy Course') {
    const ogTitle = getAttr('meta[property="og:title"]', 'content');
    if (ogTitle) {
      result.courseTitle = ogTitle.replace(/\s*\|\s*Udemy.*$/i, '').trim();
    } else if (doc.title) {
      result.courseTitle = doc.title.replace(/\s*\|\s*Udemy.*$/i, '').trim();
    }
  }

  // 3. Extract Lecture Title
  const lectureTitleSelectors = [
    '[data-purpose="item-title"]',
    '.curriculum-item-view--title',
    'span.video-viewer--title',
    '[data-purpose="video-title"]',
    '.section-item-title'
  ];

  for (const sel of lectureTitleSelectors) {
    const lTitle = q(sel);
    if (lTitle) {
      result.lectureTitle = lTitle;
      break;
    }
  }

  // 4. Extract Course ID from DOM if not already found
  if (!result.courseId) {
    const courseIdAttr = getAttr('[data-course-id]', 'data-course-id') ||
                         getAttr('body', 'data-course-id');
    if (courseIdAttr) {
      result.courseId = courseIdAttr;
    }
  }

  return result;
}

/**
 * Extracts media video sources and subtitle tracks from a DOM-like structure.
 * 
 * @param {Object} doc - Document object or mock document
 * @returns {Object} Extracted streams and subtitles
 */
export function extractMediaFromDom(doc) {
  const result = {
    videoSources: [],
    subtitles: [],
    hasDrmIndicators: false
  };

  if (!doc || !doc.querySelectorAll) return result;

  try {
    // 1. Scan <video> and <source> elements
    const videoElements = doc.querySelectorAll('video');
    videoElements.forEach(vid => {
      const vidSrc = vid.getAttribute ? vid.getAttribute('src') : null;
      if (vidSrc) {
        result.videoSources.push({
          url: vidSrc,
          mimeType: vid.getAttribute ? (vid.getAttribute('type') || '') : '',
          label: 'Video Source'
        });
      }

      // Check data attributes
      const playbackUrl = vid.getAttribute ? (vid.getAttribute('data-playback-url') || vid.getAttribute('data-udemy-src')) : null;
      if (playbackUrl && playbackUrl !== vidSrc) {
        result.videoSources.push({
          url: playbackUrl,
          mimeType: '',
          label: 'Playback URL'
        });
      }

      // Check DRM attributes
      const drmKey = vid.getAttribute ? (vid.getAttribute('data-drm') || vid.getAttribute('data-key-system')) : null;
      if (drmKey) {
        result.hasDrmIndicators = true;
      }
    });

    // Scan <source> elements inside or outside video
    const sourceElements = doc.querySelectorAll('source');
    sourceElements.forEach(srcEl => {
      const src = srcEl.getAttribute ? srcEl.getAttribute('src') : null;
      const type = srcEl.getAttribute ? (srcEl.getAttribute('type') || '') : '';
      if (src) {
        result.videoSources.push({
          url: src,
          mimeType: type,
          label: type || 'Source'
        });
      }
    });

    // 2. Scan <track> elements for subtitles/captions
    const trackElements = doc.querySelectorAll('track');
    trackElements.forEach(trackEl => {
      const kind = trackEl.getAttribute ? (trackEl.getAttribute('kind') || '').toLowerCase() : '';
      if (kind === 'subtitles' || kind === 'captions' || !kind) {
        const src = trackEl.getAttribute ? trackEl.getAttribute('src') : null;
        const srclang = trackEl.getAttribute ? (trackEl.getAttribute('srclang') || 'en') : 'en';
        const label = trackEl.getAttribute ? (trackEl.getAttribute('label') || srclang.toUpperCase()) : srclang.toUpperCase();
        if (src) {
          result.subtitles.push({
            url: src,
            lang: srclang.toLowerCase(),
            label: label
          });
        }
      }
    });
  } catch (err) {
    console.warn('[ParserUtils] Error scanning DOM for media:', err);
  }

  return result;
}

/**
 * Strips hash fragments and cleans manifest URLs.
 * @param {string} url - Manifest URL
 * @returns {string} Cleaned URL
 */
export function cleanManifestUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.replace(/#.*$/, '');
  }
}
