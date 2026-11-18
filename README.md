# Udemy DRM Downloader - Project Documentation

## Overview
A modern Chrome Extension (Manifest V3) that inspects Udemy course lecture pages, extracts video playback sources, detects Widevine DRM encryption vs. direct MP4 streams, and downloads videos and subtitles (automatically converted from WebVTT to SubRip `.srt` format) into an organized folder layout.

---

## Architecture & How It Works

### 1. Dynamic Content Script (`src/inject/udemy-parser.js` & `content-loader.js`)
- Injected on `https://*.udemy.com/*` pages as an ES module.
- Observes DOM mutations and SPA route changes (Udemy single-page app transitions).
- Uses multi-strategy selector cascades (`parser-utils.js`) to extract:
  - Course title, course ID, course slug
  - Lecture title, lecture ID
  - Video sources (`<video>`, `<source>`, data attributes)
  - Subtitle tracks (`<track kind="subtitles">` with language codes and labels)
- Synchronizes current lecture details into `chrome.storage.local`.

### 2. DRM Detection Engine (`src/utils/drm-detector.js`)
- Classifies video streams into:
  - **`DIRECT_MP4`**: Standard progressive MP4 stream. Downloadable directly as standalone MP4.
  - **`HLS`**: HTTP Live Streaming playlist (`.m3u8`).
  - **`DASH`**: Dynamic Adaptive Streaming manifest (`.mpd`).
  - **`WIDEVINE_DRM`**: Widevine CENC encrypted stream. Identifies encryption keys and informs the user that browser CDM decryption is required.

### 3. Background Service Worker (`src/bg.js`)
- Pure Manifest V3 Service Worker adhering to Chromium security boundaries (no invalid Node.js subprocess imports).
- Coordinates downloads via standard `chrome.downloads` API with conflict resolution (`uniquify`).
- Handles subtitle conversion on-the-fly:
  1. Fetches raw WebVTT content (`.vtt`).
  2. Converts WebVTT timestamps, cues, and formatting into standard `.srt` (`00:00:00,000`).
  3. Encodes as Data URI and triggers download into organized subfolders.

### 4. Interactive Popup UI (`src/popup.html` & `src/popup.js`)
- Dark-mode, modern interface displaying:
  - Current Course and Lecture titles
  - Stream status badge with color codes (Green for Direct MP4, Red for DRM, Orange for HLS/DASH)
  - Subtitle track list with individual and bulk download actions
  - "Download Video" button with status notifications

### 5. Output Organization (`src/utils/filename-utils.js`)
Files are saved using sanitized paths:
```
<Downloads>/UdemyDownloads/
  <CourseID>_<CourseTitle>/
    <LectureNumber>_<LectureTitle>.mp4
    subtitles/
      <LectureNumber>_<LectureTitle>.<lang>.srt
```
- Removes illegal Windows/Unix filesystem characters (`< > : " / \ | ? *`).
- Truncates long filenames and protects reserved Windows device names (`CON`, `PRN`, `AUX`, `NUL`).

---

## Project Structure
```
UdemyDownloader/
├── package.json                   # Project metadata and test commands
├── run-tests.ps1                  # PowerShell test runner script
├── run-tests.bat                  # Batch test launcher
├── README.md                      # Documentation
├── src/
│   ├── manifest.json              # Chrome Extension MV3 configuration
│   ├── bg.js                      # Background service worker (downloads & conversion)
│   ├── popup.html                 # Extension popup interface
│   ├── popup.js                   # Popup logic and messaging
│   ├── inject/
│   │   ├── content-loader.js      # Dynamic ES module content loader
│   │   └── udemy-parser.js        # Main content script parser
│   ├── utils/
│   │   ├── subtitle-utils.js      # WebVTT to SRT parser and timestamp converter
│   │   ├── filename-utils.js      # Path builder and Windows filename sanitizer
│   │   ├── parser-utils.js        # DOM selectors & URL extraction utilities
│   │   └── drm-detector.js        # Stream classifier and DRM analyzer
│   └── icons/
│       ├── icon48.png             # 48x48 icon
│       └── icon128.png            # 128x128 icon
└── tests/
    ├── subtitle-utils.test.js     # Unit tests for VTT-to-SRT conversion
    ├── filename-utils.test.js     # Unit tests for filename sanitization & paths
    ├── drm-detector.test.js       # Unit tests for stream & DRM detection
    ├── parser-utils.test.js       # Unit tests for URL and DOM parsing
    ├── content-script.test.js     # Unit tests for scraper & storage sync
    └── bg-handlers.test.js        # Unit tests for background download dispatcher
```

---

## Installation & Usage

### 1. Load Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Turn ON **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the `src` directory:
   ```
   c:\Users\weihon\Documents\Udemy\Projects\UdemyDownloader\src
   ```
5. The extension icon will appear in your Chrome toolbar.

### 2. Downloading Videos & Subtitles
1. Open any lecture video on [Udemy](https://www.udemy.com).
2. Click the extension toolbar icon to open the popup.
3. Click **"Scan"** to read the current video stream and subtitle tracks.
4. If a direct MP4 stream is present, click **"Download Video (.mp4)"**.
5. Click **"Download"** next to any subtitle track to save it as a clean `.srt` file.

---

## Unit Testing
The project includes a comprehensive test suite built on the native Node.js test runner (`node:test` and `node:assert/strict`).

To run the unit tests:
```powershell
# In PowerShell:
.\run-tests.ps1

# Or in CMD:
run-tests.bat

# Or with npm/node (if node is in your PATH):
npm test
```

### Test Coverage Highlights
- **Subtitle Utils**: Millisecond normalization (`.` to `,`), VTT header stripping, NOTE block rejection, HTML/Ruby tag cleaning, cue sequential numbering.
- **Filename Utils**: Sanitization of illegal characters, trailing space/dot elimination, Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`), length bounding, path hierarchies.
- **DRM Detector**: URL, MIME type, and keySystem classification for Direct MP4, HLS, DASH, and Widevine DRM.
- **Parser Utils**: Course and lecture URL parsing, DOM selector fallbacks, meta tags, and track element discovery.
- **Background Handlers**: Chrome download invocations, error rejection on DRM streams, VTT fetching and SRT conversion workflows.
