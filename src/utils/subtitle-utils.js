/**
 * Subtitle Utilities: WebVTT to SRT conversion and formatting.
 */

/**
 * Normalizes timestamp from WebVTT (hh:mm:ss.ms or mm:ss.ms) to SRT format (hh:mm:ss,ms).
 * @param {string} timestamp - WebVTT timestamp (e.g. "01:23.456" or "01:02:03.456")
 * @returns {string} SRT timestamp (e.g. "00:01:23,456" or "01:02:03,456")
 */
export function formatSrtTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') {
    return '00:00:00,000';
  }

  const cleaned = timestamp.trim().replace('.', ',');
  const parts = cleaned.split(':');

  if (parts.length === 2) {
    // mm:ss,ms -> 00:mm:ss,ms
    const [mm, rest] = parts;
    const [ss, ms = '000'] = rest.split(',');
    const paddedMm = mm.padStart(2, '0');
    const paddedSs = ss.padStart(2, '0');
    const paddedMs = ms.padEnd(3, '0').slice(0, 3);
    return `00:${paddedMm}:${paddedSs},${paddedMs}`;
  } else if (parts.length === 3) {
    // hh:mm:ss,ms
    const [hh, mm, rest] = parts;
    const [ss, ms = '000'] = rest.split(',');
    const paddedHh = hh.padStart(2, '0');
    const paddedMm = mm.padStart(2, '0');
    const paddedSs = ss.padStart(2, '0');
    const paddedMs = ms.padEnd(3, '0').slice(0, 3);
    return `${paddedHh}:${paddedMm}:${paddedSs},${paddedMs}`;
  }

  return '00:00:00,000';
}

/**
 * Strips HTML and WebVTT styling tags (e.g., <v Speaker>, <b>, <i>, <c.color>, etc.)
 * @param {string} text - Raw cue text
 * @returns {string} Plain text with tags removed
 */
export function stripVttTags(text) {
  if (!text) return '';
  return text
    .replace(/<rt[^>]*>.*?<\/rt>/gi, '')
    .replace(/<v[^>]*>/gi, '')
    .replace(/<\/v>/gi, '')
    .replace(/<c[^>]*>/gi, '')
    .replace(/<\/c>/gi, '')
    .replace(/<ruby[^>]*>/gi, '')
    .replace(/<\/ruby>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Converts WebVTT string to SubRip (SRT) format.
 * @param {string} vttText - Full WebVTT content
 * @returns {string} Formatted SRT text
 */
export function vttToSrt(vttText) {
  if (!vttText || typeof vttText !== 'string') {
    return '';
  }

  // Normalize line endings to \n
  const normalized = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const srtCues = [];
  let cueIndex = 1;

  let inHeader = true;
  let currentCueTiming = null;
  let currentCuePayload = [];

  const timingRegex = /^((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})(?:[ \t].*)?$/;

  function commitCurrentCue() {
    if (currentCueTiming && currentCuePayload.length > 0) {
      const text = currentCuePayload.join('\n').trim();
      if (text) {
        srtCues.push(`${cueIndex}\n${currentCueTiming}\n${text}`);
        cueIndex++;
      }
    }
    currentCueTiming = null;
    currentCuePayload = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WEBVTT header and header notes
    if (inHeader) {
      if (line.startsWith('WEBVTT') || line.startsWith('X-TIMESTAMP') || line.startsWith('REGION') || line.startsWith('STYLE')) {
        continue;
      }
      if (line === '') {
        inHeader = false;
        continue;
      }
      if (timingRegex.test(line)) {
        inHeader = false;
      } else {
        continue;
      }
    }

    // Skip NOTE comment blocks
    if (line.startsWith('NOTE')) {
      // Consume until blank line
      while (i < lines.length && lines[i].trim() !== '') {
        i++;
      }
      continue;
    }

    const match = line.match(timingRegex);
    if (match) {
      commitCurrentCue();
      const startSrt = formatSrtTimestamp(match[1]);
      const endSrt = formatSrtTimestamp(match[2]);
      currentCueTiming = `${startSrt} --> ${endSrt}`;
    } else if (currentCueTiming) {
      if (line === '') {
        commitCurrentCue();
      } else {
        const cleanedLine = stripVttTags(line);
        if (cleanedLine) {
          currentCuePayload.push(cleanedLine);
        }
      }
    }
  }

  commitCurrentCue();

  return srtCues.join('\n\n') + (srtCues.length > 0 ? '\n' : '');
}

/**
 * Creates a Data URI for SRT subtitle content suitable for downloading.
 * Uses Base64 encoding to prevent URI length limits and network failed errors in Chrome.
 * @param {string} srtText - SRT content
 * @returns {string} data: URI
 */
export function createSrtDataUri(srtText) {
  if (!srtText) return 'data:text/plain;charset=utf-8,';
  try {
    const base64 = btoa(unescape(encodeURIComponent(srtText)));
    return `data:text/plain;charset=utf-8;base64,${base64}`;
  } catch {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(srtText)}`;
  }
}
