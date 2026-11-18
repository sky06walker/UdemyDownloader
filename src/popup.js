/**
 * Udemy Downloader — Popup Script
 *
 * Flow:
 *   1. On open → read cached data from chrome.storage → render.
 *   2. User clicks "🔄 Scan" → FETCH_STREAMS → content script calls Udemy API
 *      → returns direct CDN MP4 URLs at every quality + subtitle tracks → render.
 *   3. User clicks a quality's "Download" → DOWNLOAD_VIDEO → background downloads.
 *   4. User clicks subtitle "Download" → DOWNLOAD_SUBTITLE → background converts & downloads.
 */

let currentData = null;

const $ = id => document.getElementById(id);
const elCourseTitle  = $('course-title');
const elLectureTitle = $('lecture-title');
const elStreamStatus = $('stream-status');
const elVidCount     = $('vid-count');
const elVideoCard    = $('video-card');
const elVideoList    = $('video-list');
const elSubCount     = $('sub-count');
const elSubsCard     = $('subs-card');
const elSubsList     = $('subtitles-list');
const elBtnScan      = $('btn-scan');
const elBtnDlAllSubs = $('btn-dl-all-subs');
const elStatusBox    = $('status-box');
const elNoticeBox    = $('notice-box');

// ── helpers ──────────────────────────────────────────────────────────────────

function showStatus(msg, isError = false) {
  elStatusBox.textContent = msg;
  elStatusBox.className = `status-msg ${isError ? 'error' : 'success'}`;
  elStatusBox.style.display = 'block';
  setTimeout(() => { elStatusBox.style.display = 'none'; }, 5000);
}

function setBadge(label, color) {
  elStreamStatus.innerHTML = `<span class="badge" style="background:${color};">${label}</span>`;
}

// ── render ───────────────────────────────────────────────────────────────────

function renderUI(data) {
  if (!data) {
    elCourseTitle.textContent  = 'No Udemy tab active';
    elLectureTitle.textContent = 'Open a lecture and click Scan';
    setBadge('Idle', '#7f8c8d');
    elVideoCard.style.display = 'none';
    elSubsCard.style.display  = 'none';
    return;
  }

  currentData = data;

  elCourseTitle.textContent  = data.courseTitle  || 'Udemy Course';
  elLectureTitle.textContent = data.lectureTitle || '—';
  setBadge(data.streamStatusLabel || 'Unknown', data.streamStatusColor || '#95a5a6');

  // ── Videos ──
  const vids = data.videos || [];
  elVidCount.textContent = vids.length;

  if (vids.length > 0) {
    elVideoCard.style.display = 'block';
    elVideoList.innerHTML = '';

    vids.forEach(v => {
      const row = document.createElement('div');
      row.className = 'item-row';

      const label = document.createElement('span');
      label.textContent = v.label || `${v.quality}p`;

      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.textContent = 'Download';
      btn.addEventListener('click', () => downloadVideo(v));

      row.appendChild(label);
      row.appendChild(btn);
      elVideoList.appendChild(row);
    });

    elNoticeBox.textContent = 'Direct CDN MP4 streams ready to download.';
    elNoticeBox.className   = 'notice';
  } else {
    elVideoCard.style.display = 'none';
    if (data.streamStatus === 'DRM_ONLY') {
      elNoticeBox.textContent = 'This lecture is DRM-protected. No direct MP4 download URLs were returned by Udemy\'s API.';
      elNoticeBox.className = 'notice danger';
    } else if (data.streamStatus === 'NO_STREAMS') {
      elNoticeBox.textContent = 'No downloadable video streams found for this lecture.';
      elNoticeBox.className = 'notice warning';
    } else if (data.streamStatus === 'ERROR') {
      elNoticeBox.textContent = 'An error occurred. Try clicking Scan again.';
      elNoticeBox.className = 'notice danger';
    }
  }

  // ── Subtitles ──
  const subs = data.subtitles || [];
  elSubCount.textContent = subs.length;

  if (subs.length > 0) {
    elSubsCard.style.display = 'block';
    elSubsList.innerHTML = '';

    subs.forEach(sub => {
      const row = document.createElement('div');
      row.className = 'item-row';

      const label = document.createElement('span');
      label.textContent = `${sub.label || sub.lang.toUpperCase()} (.srt)`;

      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.textContent = 'Download';
      btn.addEventListener('click', () => downloadSubtitle(sub));

      row.appendChild(label);
      row.appendChild(btn);
      elSubsList.appendChild(row);
    });
  } else {
    elSubsCard.style.display = 'none';
  }
}

// ── download actions ─────────────────────────────────────────────────────────

async function downloadVideo(v) {
  if (!currentData || !v) return;
  try {
    showStatus(`Downloading ${v.label || v.quality + 'p'}…`);
    const res = await chrome.runtime.sendMessage({
      action:  'DOWNLOAD_VIDEO',
      payload: {
        videoUrl:     v.url,
        quality:      v.quality,
        courseId:      currentData.courseId,
        courseTitle:   currentData.courseTitle,
        lectureTitle: currentData.lectureTitle,
        lectureIndex: currentData.lectureIndex
      }
    });
    if (res?.success) showStatus(`Video download started! (ID: ${res.downloadId})`);
    else              showStatus(res?.error || 'Download failed.', true);
  } catch (err) { showStatus(err.message, true); }
}

async function downloadSubtitle(sub) {
  if (!currentData || !sub) return;
  try {
    showStatus(`Downloading subtitle (${sub.lang})…`);
    const res = await chrome.runtime.sendMessage({
      action:  'DOWNLOAD_SUBTITLE',
      payload: {
        subtitleUrl:  sub.url,
        lang:         sub.lang,
        courseId:      currentData.courseId,
        courseTitle:   currentData.courseTitle,
        lectureTitle: currentData.lectureTitle,
        lectureIndex: currentData.lectureIndex
      }
    });
    if (res?.success) showStatus(`Subtitle saved as SRT! (ID: ${res.downloadId})`);
    else              showStatus(res?.error || 'Subtitle download failed.', true);
  } catch (err) { showStatus(err.message, true); }
}

async function downloadAllSubtitles() {
  if (!currentData?.subtitles?.length) return;
  for (const sub of currentData.subtitles) await downloadSubtitle(sub);
}

// ── scan / load ──────────────────────────────────────────────────────────────

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function loadCached() {
  const items = await chrome.storage.local.get(['udemyCurrentLecture']);
  if (items.udemyCurrentLecture) renderUI(items.udemyCurrentLecture);
}

async function scanStreams() {
  const tabId = await getActiveTabId();
  if (!tabId) { showStatus('No active tab found.', true); return; }

  // Show loading state
  elBtnScan.disabled = true;
  elBtnScan.innerHTML = '<span class="spinner"></span> Scanning…';
  setBadge('Scanning…', '#3498db');

  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'FETCH_STREAMS' });

    if (response?.success && response.data) {
      renderUI(response.data);
      showStatus('Streams fetched successfully!');
    } else {
      showStatus(response?.error || 'Failed to fetch streams from API.', true);
      setBadge('Error', '#e74c3c');
    }
  } catch (err) {
    showStatus('Content script not responding. Refresh the Udemy tab and try again.', true);
    setBadge('Error', '#e74c3c');
    console.error('[Popup] Scan error:', err);
  } finally {
    elBtnScan.disabled = false;
    elBtnScan.innerHTML = '🔄 Scan';
  }
}

// ── init ─────────────────────────────────────────────────────────────────────
elBtnScan.addEventListener('click', scanStreams);
elBtnDlAllSubs.addEventListener('click', downloadAllSubtitles);

document.addEventListener('DOMContentLoaded', loadCached);
