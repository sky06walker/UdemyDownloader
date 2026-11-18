/**
 * Chrome MV3 Content Script Loader
 * Dynamically loads the main ES module content script.
 */
(async () => {
  try {
    const scriptUrl = chrome.runtime.getURL('inject/udemy-parser.js');
    await import(scriptUrl);
  } catch (err) {
    console.error('[UdemyDownloader] Failed to load content script module:', err);
  }
})();
