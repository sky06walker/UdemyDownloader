# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No build step, no dependencies, no linter — plain ES modules loaded directly by Chrome (`"type": "module"` in `package.json`).

```powershell
npm test                                  # node --test tests/*.test.js
node --test tests/drm-detector.test.js    # single test file
node --test --test-name-pattern="CHECK_DRM" tests/bg-handlers.test.js   # single test by name
.\run-tests.ps1                           # same suite; falls back to VS Code's bundled Node if `node` isn't on PATH
```

To try the extension: `chrome://extensions` → Developer mode → "Load unpacked" → select the `src/` directory (not the repo root). Reload the extension after changing `bg.js` or `manifest.json`; reload the Udemy tab after changing content scripts.

## Architecture

Chrome Manifest V3 extension. Extension root is `src/`; `tests/` sits outside it and is never shipped. Four runtime contexts communicate through `chrome.runtime` messages and `chrome.storage.local`:

1. **Content script** — `manifest.json` registers only `inject/content-loader.js`, which dynamically `import()`s `inject/udemy-parser.js` via `chrome.runtime.getURL`. This indirection is what lets the content script be an ES module that imports `utils/*`; it is also why `inject/*.js` and `utils/*.js` must stay listed in `web_accessible_resources`. Any new module imported by the content script must be covered by those globs.
   - `udemy-parser.js` scrapes the DOM (via `utils/parser-utils.js`), classifies the stream (`utils/drm-detector.js`), writes the result to `chrome.storage.local` (`udemyCurrentLecture` plus flattened `udemy*` keys), and answers `GET_LECTURE_DATA` / `PARSE_PAGE` messages. A `MutationObserver` on `document.body` detects Udemy SPA navigation by comparing `location.href`, then re-scrapes after a delay.
2. **Background service worker** (`bg.js`) — a single `chrome.runtime.onMessage` listener delegating to `handleDownloadRequest({ action, payload })`. Actions: `DOWNLOAD_VIDEO`, `DOWNLOAD_SUBTITLE`, `CHECK_DRM`. Replies `{ success, ... }` or `{ success: false, error }`. Subtitles are fetched as VTT, converted with `utils/subtitle-utils.js`, and downloaded as a `data:` URI; videos are passed straight to `chrome.downloads.download`. Widevine-classified streams are rejected here (not only in the UI).
3. **Popup** (`popup.html` / `popup.js`) — not an ES module and imports nothing; it renders from the cached `udemyCurrentLecture` in storage, then asks the active tab for fresh data and sends download messages to the background.
4. **Pure utils** (`src/utils/*`) — stateless, DOM-free (DOM-taking functions accept a `doc` argument), so they are unit-testable in plain Node.

Download paths come from `buildDownloadPath` in `filename-utils.js`: `UdemyDownloads/<courseId>_<title>/<NN>_<lecture>.<ext>`, with subtitles in a `subtitles/` subfolder as `.<lang>.srt`. Filenames are sanitized for Windows (illegal chars, reserved device names, trailing dots/spaces, length cap) since paths are handed to `chrome.downloads`.

## Testing conventions

- Native `node:test` + `node:assert/strict`; no JSDOM. DOM is faked with hand-built `mockDoc` objects (`querySelector`/`querySelectorAll` stubs) passed into the function under test — which is why scraper functions take `doc` as a parameter instead of reading the global `document`.
- Chrome APIs are faked per test by assigning `globalThis.chrome = {...}` (e.g. `downloads.download` invoking its callback with a fake ID). `bg.js` and `udemy-parser.js` guard on `typeof chrome` / `window` so they can be imported in Node; keep those guards when editing.
- Keep new background/content logic exported and parameterized so it stays testable this way.
