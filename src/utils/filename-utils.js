/**
 * Filename & Path Utilities: safe sanitization and directory path building.
 */

// Windows reserved device names
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Sanitizes a string to make it safe for use as a file or folder name.
 * Removes characters: < > : " / \ | ? * and ASCII control characters (0x00-0x1F).
 * Trims leading/trailing whitespace and dots.
 * 
 * @param {string} name - Raw filename or directory name
 * @param {string} [replacement='_'] - Replacement character for illegal characters
 * @param {number} [maxLength=100] - Maximum length of the sanitized string
 * @returns {string} Sanitized string
 */
export function sanitizeFilename(name, replacement = '_', maxLength = 100) {
  if (!name || typeof name !== 'string') {
    return 'untitled';
  }

  let sanitized = name
    // Replace illegal characters: < > : " / \ | ? * and control chars
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement)
    // Replace multiple consecutive replacement characters with a single one
    .replace(new RegExp(`\\${replacement}+`, 'g'), replacement)
    // Trim leading/trailing whitespace, dots, and hyphens/underscores
    .trim()
    .replace(/^[\s._-]+|[\s._-]+$/g, '');

  // Truncate to maximum length without breaking halfway through a character
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength).trim().replace(/[\s._-]+$/, '');
  }

  // Check for Windows reserved names
  if (WINDOWS_RESERVED.test(sanitized)) {
    sanitized = `${sanitized}_file`;
  }

  return sanitized || 'untitled';
}

/**
 * Builds a structured, relative download path for Chrome Downloads API.
 * e.g., "UdemyDownloads/12345_Machine_Learning/01_Introduction.mp4"
 * 
 * @param {Object} options
 * @param {string|number} [options.courseId]
 * @param {string} [options.courseTitle]
 * @param {number|string} [options.lectureIndex]
 * @param {string} [options.lectureTitle]
 * @param {string} [options.extension='mp4']
 * @param {string} [options.subfolder=''] - e.g. 'subtitles'
 * @param {string} [options.baseFolder='UdemyDownloads']
 * @returns {string} Relative POSIX-style download path for chrome.downloads
 */
export function buildDownloadPath({
  courseId = '',
  courseTitle = 'Udemy Course',
  lectureIndex = '',
  lectureTitle = 'Lecture',
  extension = 'mp4',
  subfolder = '',
  baseFolder = 'UdemyDownloads'
} = {}) {
  const safeBase = sanitizeFilename(baseFolder, '_', 40);

  const coursePrefix = courseId ? `${courseId}_` : '';
  const safeCourseFolder = sanitizeFilename(`${coursePrefix}${courseTitle}`, '_', 80);

  let lecturePrefix = '';
  if (lectureIndex !== '' && lectureIndex !== null && lectureIndex !== undefined) {
    const num = Number(lectureIndex);
    lecturePrefix = !isNaN(num) ? `${String(num).padStart(2, '0')}_` : `${lectureIndex}_`;
  }

  const safeFileBase = sanitizeFilename(`${lecturePrefix}${lectureTitle}`, '_', 90);
  const cleanExt = extension.replace(/^\./, '').toLowerCase();

  const filename = cleanExt ? `${safeFileBase}.${cleanExt}` : safeFileBase;

  const pathSegments = [safeBase, safeCourseFolder];

  if (subfolder && typeof subfolder === 'string') {
    const safeSub = sanitizeFilename(subfolder, '_', 40);
    if (safeSub && safeSub !== 'untitled') {
      pathSegments.push(safeSub);
    }
  }

  pathSegments.push(filename);

  return pathSegments.join('/');
}
