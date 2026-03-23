(function () {
  const PAGE_DEBUG_PREFIX = "[Canvas Kaltura Autoplay:Page]";
  const RETRY_DELAYS_MS = [0, 500, 1500, 3000, 6000, 10000];
  const BOUND_VIDEO_FLAG = "data-autoplay-extension-ended-bound";
  const ENDED_MESSAGE_TYPE = "canvas-kaltura-autoplay-video-ended";
  const UNMUTE_DELAYS_MS = [300, 1000, 2500];
  const PLAY_REQUEST_FLAG = "__canvasKalturaAutoplayPlayRequested";
  const UNMUTE_REQUEST_FLAG = "__canvasKalturaAutoplayUnmuteRequested";
  const PLAYBACK_SPEED_ATTRIBUTE = "data-canvas-kaltura-autoplay-speed";
  const DEFAULT_PLAYBACK_SPEED = 1;

  function pageLog(message, extra) {
    if (extra === undefined) {
      console.log(PAGE_DEBUG_PREFIX, message);
      return;
    }

    console.log(PAGE_DEBUG_PREFIX, message, extra);
  }

  function getCandidatePlayers() {
    const candidates = [];
    const playerId = window.kalturaIframePackageData && window.kalturaIframePackageData.playerId;

    if (playerId && window[playerId]) {
      candidates.push(window[playerId]);
    }

    if (playerId) {
      const playerElement = document.getElementById(playerId);
      if (playerElement) {
        candidates.push(playerElement);
      }
    }

    for (const candidate of document.querySelectorAll("object, embed, video, .mwPlayerContainer")) {
      candidates.push(candidate);
    }

    return [...new Set(candidates)];
  }

  function getPreferredPlaybackSpeed() {
    const raw = document.documentElement.getAttribute(PLAYBACK_SPEED_ATTRIBUTE);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PLAYBACK_SPEED;
  }

  function applyPlaybackSpeed(player) {
    const speed = getPreferredPlaybackSpeed();
    let changed = false;

    if (player && typeof player.sendNotification === "function") {
      try {
        player.sendNotification("doSpeedChange", speed);
        changed = true;
      } catch (error) {
        pageLog("doSpeedChange failed", error);
      }
    }

    for (const video of document.querySelectorAll("video")) {
      if (!(video instanceof HTMLVideoElement)) {
        continue;
      }

      try {
        video.playbackRate = speed;
        video.defaultPlaybackRate = speed;
        changed = true;
      } catch (error) {
        pageLog("Failed to apply video playback rate", error);
      }
    }

    if (changed) {
      pageLog("Applied playback speed", speed);
    }
  }

  function tryPlayerApi(player) {
    if (!player || typeof player.sendNotification !== "function") {
      return false;
    }

    if (player[PLAY_REQUEST_FLAG]) {
      return true;
    }

    try {
      player[PLAY_REQUEST_FLAG] = true;
      player.sendNotification("doPlay");
      pageLog("Triggered Kaltura doPlay");
      schedulePlaybackSpeed(player);
      scheduleUnmute(player);
      return true;
    } catch (error) {
      player[PLAY_REQUEST_FLAG] = false;
      pageLog("doPlay failed", error);
      return false;
    }
  }

  function tryUnmutePlayer(player) {
    if (!player || typeof player.sendNotification !== "function") {
      return false;
    }

    let succeeded = false;

    try {
      player.sendNotification("unmute");
      succeeded = true;
    } catch (error) {
      pageLog("unmute notification failed", error);
    }

    try {
      player.sendNotification("changeVolume", 1);
      succeeded = true;
    } catch (error) {
      pageLog("changeVolume(1) failed", error);
    }

    return succeeded;
  }

  function tryUnmuteVideoElements() {
    let changed = false;

    for (const video of document.querySelectorAll("video")) {
      if (!(video instanceof HTMLVideoElement)) {
        continue;
      }

      try {
        video.muted = false;
        video.defaultMuted = false;
        video.volume = 1;
        changed = true;
      } catch (error) {
        pageLog("Failed to update video element mute state", error);
      }
    }

    return changed;
  }

  function tryUnmuteControls() {
    const selectors = [
      "#muteBtn",
      ".icon-volume-mute",
      "button[aria-label='Unmute']",
      "button[title='Unmute']"
    ];

    for (const selector of selectors) {
      const control = document.querySelector(selector);
      if (!(control instanceof HTMLElement)) {
        continue;
      }

      const label = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`.toLowerCase();
      const className = (control.className || "").toString().toLowerCase();
      const looksLikeUnmute =
        label.includes("unmute") ||
        className.includes("volume-mute") ||
        className.includes("muted");

      if (!looksLikeUnmute) {
        continue;
      }

      try {
        control.click();
        pageLog("Clicked unmute control", selector);
        return true;
      } catch (error) {
        pageLog("Failed to click unmute control", { selector, error });
      }
    }

    return false;
  }

  function scheduleUnmute(player) {
    if (player && player[UNMUTE_REQUEST_FLAG]) {
      return;
    }

    if (player) {
      player[UNMUTE_REQUEST_FLAG] = true;
    }

    for (const delay of UNMUTE_DELAYS_MS) {
      window.setTimeout(() => {
        const apiResult = tryUnmutePlayer(player);
        const videoResult = tryUnmuteVideoElements();
        const controlResult = tryUnmuteControls();

        if (apiResult || videoResult || controlResult) {
          pageLog("Attempted player unmute");
        }
      }, delay);
    }
  }

  function schedulePlaybackSpeed(player) {
    for (const delay of UNMUTE_DELAYS_MS) {
      window.setTimeout(() => {
        applyPlaybackSpeed(player);
      }, delay);
    }
  }

  function tryAllPlayers() {
    let started = false;

    for (const player of getCandidatePlayers()) {
      started = tryPlayerApi(player) || started;
    }

    if (!started) {
      pageLog("No Kaltura player API candidate accepted doPlay");
    }

    return started;
  }

  function notifyParentVideoEnded() {
    try {
      window.parent.postMessage(
        {
          type: ENDED_MESSAGE_TYPE,
          source: "canvas-kaltura-autoplay"
        },
        "*"
      );
      pageLog("Posted video ended message to parent");
    } catch (error) {
      pageLog("Failed to post video ended message", error);
    }
  }

  function bindVideoEnded(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    if (video.getAttribute(BOUND_VIDEO_FLAG) === "true") {
      return;
    }

    video.setAttribute(BOUND_VIDEO_FLAG, "true");
    video.addEventListener("ended", notifyParentVideoEnded, { once: true });
    video.addEventListener("loadedmetadata", () => applyPlaybackSpeed(null));
    video.addEventListener("play", () => applyPlaybackSpeed(null));
    pageLog("Bound ended listener to video element");
  }

  function bindExistingVideos() {
    document.querySelectorAll("video").forEach(bindVideoEnded);
  }

  function observeVideos() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches("video")) {
            bindVideoEnded(node);
          }

          node.querySelectorAll?.("video").forEach(bindVideoEnded);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function bindEmbedPlayerEvents() {
    if (!window.jQuery || !window.mw) {
      pageLog("jQuery/mw not ready for EmbedPlayer binding");
      return;
    }

    try {
      window.jQuery(window.mw).bind("EmbedPlayerNewPlayer", function (event, embedPlayer) {
        pageLog("EmbedPlayerNewPlayer fired");
        tryPlayerApi(embedPlayer);
      });
      pageLog("Bound EmbedPlayerNewPlayer listener");
    } catch (error) {
      pageLog("Failed to bind EmbedPlayerNewPlayer", error);
    }
  }

  bindEmbedPlayerEvents();
  bindExistingVideos();
  observeVideos();

  for (const delay of RETRY_DELAYS_MS) {
    window.setTimeout(() => {
      bindExistingVideos();
      tryAllPlayers();
    }, delay);
  }
})();
