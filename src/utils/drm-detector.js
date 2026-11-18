/**
 * DRM & Media Stream Detector: Classifies media URLs, MIME types, and encryption schemes.
 */

export const STREAM_TYPES = {
  DIRECT_MP4: 'DIRECT_MP4',
  HLS: 'HLS',
  DASH: 'DASH',
  WIDEVINE_DRM: 'WIDEVINE_DRM',
  BLOB_STREAM: 'BLOB_STREAM',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Evaluates whether a video stream is direct MP4, adaptive HLS/DASH, or protected by Widevine DRM.
 * 
 * @param {Object} streamInfo
 * @param {string} [streamInfo.url='']
 * @param {string} [streamInfo.mimeType='']
 * @param {boolean} [streamInfo.hasDrmKey=false]
 * @param {string} [streamInfo.keySystem='']
 * @returns {Object} Diagnostic result with stream classification and recommendations
 */
export function detectStreamInfo({
  url = '',
  mimeType = '',
  hasDrmKey = false,
  keySystem = ''
} = {}) {
  const cleanUrl = (url || '').toLowerCase();
  const cleanMime = (mimeType || '').toLowerCase();
  const cleanKeySystem = (keySystem || '').toLowerCase();

  // Widevine indicators
  const isWidevine =
    hasDrmKey === true ||
    cleanKeySystem.includes('widevine') ||
    cleanUrl.includes('widevine') ||
    cleanUrl.includes('/drm/') ||
    cleanUrl.includes('cenc') ||
    cleanUrl.includes('fairplay') ||
    cleanUrl.includes('playready');

  if (isWidevine) {
    return {
      type: STREAM_TYPES.WIDEVINE_DRM,
      isDrmProtected: true,
      isDirectDownloadable: false,
      label: 'Widevine DRM Protected',
      badgeColor: '#e74c3c',
      message: 'This video stream is encrypted with Widevine DRM and requires browser CDM decryption keys.',
      recommendation: 'Direct clear MP4 downloading is restricted for this DRM track. Subtitles and audio/clear streams can still be downloaded.'
    };
  }

  // In-memory Blob URL (MSE - MediaSource Extensions)
  if (cleanUrl.startsWith('blob:')) {
    return {
      type: STREAM_TYPES.BLOB_STREAM,
      isDrmProtected: false,
      isDirectDownloadable: false,
      label: 'MediaSource Buffer (blob:)',
      badgeColor: '#e67e22',
      message: 'This stream uses in-memory MediaSource buffering (blob: URL). Chrome blocks extensions from downloading ephemeral cross-origin blobs directly, resulting in "Network error".',
      recommendation: 'Stream is assembled via JavaScript chunks in memory rather than a direct downloadable file.'
    };
  }

  // Direct MP4
  if (
    cleanMime === 'video/mp4' ||
    cleanUrl.endsWith('.mp4') ||
    cleanUrl.includes('.mp4?') ||
    cleanUrl.includes('/mp4/')
  ) {
    return {
      type: STREAM_TYPES.DIRECT_MP4,
      isDrmProtected: false,
      isDirectDownloadable: true,
      label: 'Direct MP4',
      badgeColor: '#2ecc71',
      message: 'Direct MP4 stream detected. Can be downloaded directly as standalone MP4.',
      recommendation: 'Ready for direct download.'
    };
  }

  // HLS stream (.m3u8)
  if (
    cleanMime.includes('application/x-mpegurl') ||
    cleanMime.includes('application/vnd.apple.mpegurl') ||
    cleanUrl.includes('.m3u8')
  ) {
    return {
      type: STREAM_TYPES.HLS,
      isDrmProtected: false,
      isDirectDownloadable: false,
      label: 'HLS Stream (m3u8)',
      badgeColor: '#f39c12',
      message: 'HLS adaptive stream manifest detected.',
      recommendation: 'Segmented HLS stream requires playlist muxing.'
    };
  }

  // DASH manifest (.mpd)
  if (
    cleanMime.includes('application/dash+xml') ||
    cleanUrl.includes('.mpd')
  ) {
    return {
      type: STREAM_TYPES.DASH,
      isDrmProtected: false,
      isDirectDownloadable: false,
      label: 'DASH Stream (mpd)',
      badgeColor: '#3498db',
      message: 'DASH adaptive stream manifest detected.',
      recommendation: 'Segmented DASH stream manifest.'
    };
  }

  return {
    type: STREAM_TYPES.UNKNOWN,
    isDrmProtected: false,
    isDirectDownloadable: false,
    label: 'Unknown Stream',
    badgeColor: '#95a5a6',
    message: 'Unrecognized stream format.',
    recommendation: 'Inspect media player element on the page.'
  };
}
