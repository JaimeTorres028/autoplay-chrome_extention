(function () {
  const PAGE_DEBUG_PREFIX = "[Canvas Kaltura Autoplay:Page]";
  const RETRY_DELAYS_MS = [0, 500, 1500, 3000, 6000, 10000];
  const BOUND_VIDEO_FLAG = "data-autoplay-extension-ended-bound";
  const ENDED_MESSAGE_TYPE = "canvas-kaltura-autoplay-video-ended";

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

  function tryPlayerApi(player) {
    if (!player || typeof player.sendNotification !== "function") {
      return false;
    }

    try {
      player.sendNotification("changeVolume", 0);
    } catch (error) {
      pageLog("changeVolume failed", error);
    }

    try {
      player.sendNotification("doPlay");
      pageLog("Triggered Kaltura doPlay");
      return true;
    } catch (error) {
      pageLog("doPlay failed", error);
      return false;
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
