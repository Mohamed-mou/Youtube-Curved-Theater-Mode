(function() {
  'use strict';

  if (!window.location.pathname.startsWith('/watch')) return;

  // ============================================================
  // SETTINGS
  // ============================================================
  const DEFAULT_SETTINGS = { radius: 20, rememberTheater: false };
  let settings = { ...DEFAULT_SETTINGS };

  function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve(settings);
        return;
      }
      chrome.storage.sync.get(DEFAULT_SETTINGS, (data) => {
        settings = { ...DEFAULT_SETTINGS, ...data };
        resolve(settings);
      });
    });
  }

  function saveSetting(key, value) {
    settings[key] = value;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ [key]: value });
    }
  }

  function applyRadius() {
    document.documentElement.style.setProperty('--yt-curved-radius', settings.radius + 'px');
  }

  // ============================================================
  // STATE
  // ============================================================
  let theaterButtonObserver = null;
  let watchFlexyObserver = null;
  let bodyObserver = null;
  let domObserver = null;
  let barInjected = false;
  let isLooping = false;
  let retryTimer = null;

  // ============================================================
  // DEBOUNCE
  // ============================================================
  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  const debouncedUpdate = debounce(updateAllStates, 100);

  // ============================================================
  // THEATER BUTTON — flexible selector
  // ============================================================
  function getTheaterButton() {
    // YouTube's theater button has class .ytp-size-button on the player
    // but it also has an aria-label like "Theater mode" / "Default view"
    // Use multiple selectors to be safe.
    return (
      document.querySelector('.ytp-size-button[aria-label]') ||
      document.querySelector('button[aria-label="Theater mode"]') ||
      document.querySelector('button[aria-label*="Theater" i]') ||
      document.querySelector('button[data-tooltip-target-id="ytp-size-button"]')
    );
  }

  // ============================================================
  // DETECTION
  // ============================================================
  function checkTheaterMode() {
    // 1. Prefer the watch-flexy attribute — it's the source of truth
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy && watchFlexy.hasAttribute('theater')) return true;

    // 2. Body class (older layouts)
    if (document.body.classList.contains('theater')) return true;

    // 3. Player element class
    const player = document.querySelector('#movie_player');
    if (player && player.classList.contains('ytp-fullscreen')) return false; // fullscreen isn't theater

    return false;
  }

  function checkFullscreenMode() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    const player = document.querySelector('#movie_player');
    if (player && player.classList.contains('ytp-fullscreen')) return true;
    return false;
  }

  // ============================================================
  // STATE UPDATES
  // ============================================================
  function updateTheaterState() {
    const html = document.documentElement;
    const isActive = checkTheaterMode();
    if (isActive && !html.classList.contains('yt-theater-curved')) {
      html.classList.add('yt-theater-curved');
      console.log('[YT Curved] ✅ Theater mode ON');
    } else if (!isActive && html.classList.contains('yt-theater-curved')) {
      html.classList.remove('yt-theater-curved');
      console.log('[YT Curved] ❌ Theater mode OFF');
    }
  }

  function updateFullscreenState() {
    const html = document.documentElement;
    const isActive = checkFullscreenMode();
    if (isActive && !html.classList.contains('yt-fullscreen-curved')) {
      html.classList.add('yt-fullscreen-curved');
      console.log('[YT Curved] ✅ Fullscreen ON');
    } else if (!isActive && html.classList.contains('yt-fullscreen-curved')) {
      html.classList.remove('yt-fullscreen-curved');
      console.log('[YT Curved] ❌ Fullscreen OFF');
    }
  }

  function updateAllStates() {
    updateTheaterState();
    updateFullscreenState();
  }

  // ============================================================
  // SVG ICONS
  // ============================================================
  const SVG_LOOP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
  const SVG_CAMERA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>';
  const SVG_THEATER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>';
  const SVG_SETTINGS = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';

  // ============================================================
  // CONTROL BAR
  // ============================================================
  function findInsertionPoint() {
    const primaryInner = document.querySelector('ytd-watch-flexy #primary-inner');
    if (primaryInner) {
      const outerPlayer = primaryInner.querySelector('#player');
      if (outerPlayer) return outerPlayer;
    }
    return (
      document.querySelector('#player') ||
      document.querySelector('ytd-player') ||
      document.querySelector('#player-container')
    );
  }

  function injectControlBar() {
    const old = document.getElementById('yt-curved-bar');
    if (old) old.remove();

    const anchor = findInsertionPoint();
    if (!anchor) return false;

    const bar = document.createElement('div');
    bar.id = 'yt-curved-bar';

    const btnLoop = document.createElement('button');
    btnLoop.className = 'yt-curved-btn';
    btnLoop.dataset.action = 'loop';
    btnLoop.title = 'Loop video';
    btnLoop.innerHTML = SVG_LOOP;
    btnLoop.addEventListener('click', toggleLoop);

    const btnShot = document.createElement('button');
    btnShot.className = 'yt-curved-btn';
    btnShot.dataset.action = 'screenshot';
    btnShot.title = 'Screenshot';
    btnShot.innerHTML = SVG_CAMERA;
    btnShot.addEventListener('click', takeScreenshot);

    const btnTheater = document.createElement('button');
    btnTheater.className = 'yt-curved-btn';
    btnTheater.dataset.action = 'theater';
    btnTheater.title = 'Remember theater mode';
    btnTheater.innerHTML = SVG_THEATER;
    if (settings.rememberTheater) btnTheater.classList.add('active');
    btnTheater.addEventListener('click', toggleRememberTheater);

    const btnSettings = document.createElement('button');
    btnSettings.className = 'yt-curved-btn';
    btnSettings.dataset.action = 'settings';
    btnSettings.title = 'Corner radius';
    btnSettings.innerHTML = SVG_SETTINGS;
    btnSettings.addEventListener('click', toggleSettingsPopup);

    const popup = document.createElement('div');
    popup.className = 'yt-curved-settings-popup';
    popup.id = 'yt-curved-settings-popup';

    const label = document.createElement('label');
    label.textContent = 'Radius';

    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.min = '5';
    rangeInput.max = '40';
    rangeInput.step = '1';
    rangeInput.value = String(settings.radius);
    rangeInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      saveSetting('radius', val);
      applyRadius();
      const display = document.getElementById('yt-curved-radius-val');
      if (display) display.textContent = String(val);
    });

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'yt-curved-radius-val';
    valueDisplay.id = 'yt-curved-radius-val';
    valueDisplay.textContent = String(settings.radius);

    const unit = document.createElement('span');
    unit.textContent = 'px';

    popup.appendChild(label);
    popup.appendChild(rangeInput);
    popup.appendChild(valueDisplay);
    popup.appendChild(unit);

    bar.appendChild(btnLoop);
    bar.appendChild(btnShot);
    bar.appendChild(btnTheater);
    bar.appendChild(btnSettings);
    bar.appendChild(popup);

    anchor.insertAdjacentElement('afterend', bar);
    barInjected = true;
    console.log('[YT Curved] Control bar injected');
    return true;
  }

  function ensureBarInjected() {
    if (barInjected && document.getElementById('yt-curved-bar')) return;
    let tries = 0;
    const attempt = () => {
      tries++;
      if (injectControlBar() || tries > 10) return;
      setTimeout(attempt, 300);
    };
    attempt();
  }

  // ============================================================
  // BUTTON ACTIONS
  // ============================================================
  function toggleLoop(e) {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) return;
    isLooping = !isLooping;
    video.loop = isLooping;
    e.currentTarget.classList.toggle('active', isLooping);
    showToast(isLooping ? 'Loop ON' : 'Loop OFF');
  }

  function takeScreenshot() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video || !video.videoWidth) { showToast('Screenshot failed'); return; }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { showToast('Screenshot failed'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const videoId = new URLSearchParams(window.location.search).get('v') || 'video';
        a.href = url;
        a.download = `yt-${videoId}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Screenshot saved');
      }, 'image/png');
    } catch (err) {
      console.warn('[YT Curved] Screenshot error:', err);
      showToast('Screenshot blocked');
    }
  }

  function toggleRememberTheater(e) {
    const newVal = !settings.rememberTheater;
    saveSetting('rememberTheater', newVal);
    e.currentTarget.classList.toggle('active', newVal);
    showToast(newVal ? 'Will auto-enter theater mode' : 'Auto theater mode OFF');
    if (newVal) enterTheaterMode();
  }

  function toggleSettingsPopup(e) {
    const popup = document.getElementById('yt-curved-settings-popup');
    if (!popup) return;
    popup.classList.toggle('open');
    e.currentTarget.classList.toggle('active', popup.classList.contains('open'));
  }

  function enterTheaterMode() {
    if (checkTheaterMode()) return;
    const btn = getTheaterButton();
    if (btn) { btn.click(); console.log('[YT Curved] Auto-entered theater mode'); }
  }

  // ============================================================
  // TOAST
  // ============================================================
  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('yt-curved-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yt-curved-toast';
      toast.className = 'yt-curved-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ============================================================
  // OBSERVERS
  // ============================================================
  function cleanupAllObservers() {
    if (theaterButtonObserver) { theaterButtonObserver.disconnect(); theaterButtonObserver = null; }
    if (watchFlexyObserver)     { watchFlexyObserver.disconnect();     watchFlexyObserver = null; }
    if (bodyObserver)           { bodyObserver.disconnect();           bodyObserver = null; }
    if (domObserver)            { domObserver.disconnect();            domObserver = null; }
  }

  function attachTheaterButtonObserver() {
    if (theaterButtonObserver) return;
    const btn = getTheaterButton();
    if (!btn) return;
    theaterButtonObserver = new MutationObserver(() => debouncedUpdate());
    theaterButtonObserver.observe(btn, { attributes: true, attributeFilter: ['aria-pressed', 'aria-label'] });
    console.log('[YT Curved] Theater button observer attached');
  }

  function setupObservers() {
    cleanupAllObservers();

    // 1. Theater button (may appear later, retry in domObserver)
    attachTheaterButtonObserver();

    // 2. watch-flexy [theater] attribute
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) {
      watchFlexyObserver = new MutationObserver(() => debouncedUpdate());
      watchFlexyObserver.observe(watchFlexy, { attributes: true, attributeFilter: ['theater'] });
      console.log('[YT Curved] watch-flexy observer attached');
    }

    // 3. body class
    bodyObserver = new MutationObserver(() => {
      if (document.body.classList.contains('theater')) debouncedUpdate();
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 4. Catch late-arriving theater button + fullscreen class on player + inject bar
    domObserver = new MutationObserver(() => {
      attachTheaterButtonObserver();

      const player = document.querySelector('#movie_player');
      if (player && !player._ytCurvedFsObserver) {
        const fsObserver = new MutationObserver(() => debouncedUpdate());
        fsObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
        player._ytCurvedFsObserver = fsObserver;
      }

      if (!document.getElementById('yt-curved-bar')) {
        barInjected = false;
        ensureBarInjected();
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true });

    // Initial inject + state check
    ensureBarInjected();
    updateAllStates();
    console.log('[YT Curved] Observers set up');
  }

  // ============================================================
  // INIT / NAVIGATION
  // ============================================================
  function waitForWatchFlexyAndSetup(attempt) {
    attempt = attempt || 0;
    const watchFlexy = document.querySelector('ytd-watch-flexy');

    if (watchFlexy) {
      setupObservers();
      return;
    }

    if (attempt > 40) {
      console.log('[YT Curved] ytd-watch-flexy never appeared, giving up');
      // Set up anyway — observers on body will still work partially
      setupObservers();
      return;
    }

    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => waitForWatchFlexyAndSetup(attempt + 1), 250);
  }

  function reinitialize() {
    console.log('[YT Curved] Re-initializing...');
    cleanupAllObservers();
    barInjected = false;
    isLooping = false;
    clearTimeout(retryTimer);
    waitForWatchFlexyAndSetup(0);
  }

  document.addEventListener('yt-navigate-finish', reinitialize);
  document.addEventListener('fullscreenchange', () => debouncedUpdate());
  document.addEventListener('webkitfullscreenchange', () => debouncedUpdate());

  // Return from background tab / bfcache / window focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[YT Curved] Tab visible');
      if (!watchFlexyObserver) waitForWatchFlexyAndSetup(0);
      else debouncedUpdate();
    }
  });
  window.addEventListener('pageshow', () => {
    if (!watchFlexyObserver) waitForWatchFlexyAndSetup(0);
    else debouncedUpdate();
  });
  window.addEventListener('focus', () => {
    if (!watchFlexyObserver) waitForWatchFlexyAndSetup(0);
    else debouncedUpdate();
  });

  // Click / keyboard
  document.addEventListener('click', (e) => {
    if (e.target.closest('.ytp-size-button') ||
        (e.target.closest('button') && /theater/i.test(e.target.closest('button').getAttribute('aria-label') || ''))) {
      setTimeout(debouncedUpdate, 150);
    }
    const popup = document.getElementById('yt-curved-settings-popup');
    if (popup && popup.classList.contains('open')) {
      if (!e.target.closest('#yt-curved-settings-popup') &&
          !e.target.closest('[data-action="settings"]')) {
        popup.classList.remove('open');
        const btn = document.querySelector('[data-action="settings"]');
        if (btn) btn.classList.remove('active');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T' || e.key === 'f' || e.key === 'F') {
      setTimeout(debouncedUpdate, 200);
    }
  });

  // Safety net — every 2s, verify state and re-attach if needed
  setInterval(() => {
    if (document.hidden) return;
    if (!watchFlexyObserver) {
      waitForWatchFlexyAndSetup(0);
      return;
    }
    updateAllStates();

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const btn = document.querySelector('[data-action="loop"]');
    if (video && btn && video.loop !== isLooping) {
      isLooping = video.loop;
      btn.classList.toggle('active', isLooping);
    }
  }, 2000);

  // ============================================================
  // START
  // ============================================================
  async function init() {
    await loadSettings();
    applyRadius();
    console.log('[YT Curved] Init with settings:', settings);
    waitForWatchFlexyAndSetup(0);
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);

})();
