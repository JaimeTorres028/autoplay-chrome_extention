(function () {
  const AUTOPLAY_FLAG = "data-autoplay-extension-bound";
  const DEBUG_PREFIX = "[Canvas Kaltura Autoplay]";
  const RETRY_DELAYS_MS = [0, 400, 1200, 2500, 5000, 8000, 12000];
  const CLICKED_FLAG = "data-autoplay-extension-clicked";
  const ENDED_MESSAGE_TYPE = "canvas-kaltura-autoplay-video-ended";
  const NEXT_ONCE_KEY = `canvas-kaltura-autoplay-next:${window.location.pathname}`;
  const NEXT_NAVIGATION_DELAY_MS = 2000;

  function log(message, extra) {
    if (extra === undefined) {
      console.log(DEBUG_PREFIX, message);
      return;
    }

    console.log(DEBUG_PREFIX, message, extra);
  }

  function isKalturaPage() {
    return window.location.hostname.includes("kaltura.com");
  }

  function hasNavigatedNextAlready() {
    try {
      return window.sessionStorage.getItem(NEXT_ONCE_KEY) === "true";
    } catch (error) {
      log("Failed to read next-once flag", error);
      return false;
    }
  }

  function markNavigatedNext() {
    try {
      window.sessionStorage.setItem(NEXT_ONCE_KEY, "true");
    } catch (error) {
      log("Failed to store next-once flag", error);
    }
  }

  function getNextModuleLink() {
    const selectors = [
      ".module-sequence-footer-button--next a[href]",
      "a[aria-label='Next Module Item'][href]",
      "a[href*='/modules/items/']"
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link instanceof HTMLAnchorElement) {
        return link;
      }
    }

    return null;
  }

  function goToNextModuleItem() {
    if (isKalturaPage() || hasNavigatedNextAlready()) {
      return;
    }

    const nextLink = getNextModuleLink();
    if (!nextLink) {
      log("No next module link found");
      return;
    }

    markNavigatedNext();
    log(`Navigating to next module item in ${NEXT_NAVIGATION_DELAY_MS}ms`, nextLink.href);
    window.setTimeout(() => {
      window.location.assign(nextLink.href);
    }, NEXT_NAVIGATION_DELAY_MS);
  }

  function bindEndedNavigationListener() {
    if (isKalturaPage()) {
      return;
    }

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== ENDED_MESSAGE_TYPE || data.source !== "canvas-kaltura-autoplay") {
        return;
      }

      log("Received video ended message from iframe");
      goToNextModuleItem();
    });
  }

  function hasPlayableSource(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return false;
    }

    if (video.currentSrc || video.src) {
      return true;
    }

    return Array.from(video.querySelectorAll("source")).some((source) => source.src);
  }

  function injectPageScript() {
    if (!isKalturaPage() || document.documentElement.dataset.kalturaAutoplayInjected === "true") {
      return;
    }

    document.documentElement.dataset.kalturaAutoplayInjected = "true";

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-kaltura.js");

    (document.head || document.documentElement).appendChild(script);
    script.addEventListener("load", function () {
      script.remove();
    });
  }

  function dispatchRealClick(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];

    for (const eventName of events) {
      try {
        element.dispatchEvent(
          new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          })
        );
      } catch (error) {
        log("Dispatch failed", { eventName, error });
      }
    }

    try {
      element.click();
      return true;
    } catch (error) {
      log("click() failed", error);
      return false;
    }
  }

  async function attemptPlay(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return false;
    }

    if (isKalturaPage()) {
      return false;
    }

    if (!hasPlayableSource(video) && video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      return false;
    }

    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");

    if (video.readyState === 0 && hasPlayableSource(video)) {
      try {
        video.load();
      } catch (error) {
        log("Video load() failed", error);
      }
    }

    if (!video.muted) {
      video.muted = true;
      video.defaultMuted = true;
    }

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      return !video.paused;
    } catch (error) {
      if (error && (error.name === "AbortError" || error.name === "NotSupportedError")) {
        return false;
      }

      log("Muted autoplay failed", error);
      return false;
    }
  }

  function clickPlayControls(root) {
    if (isKalturaPage()) {
      return;
    }

    const selectors = [
      ".largePlayBtn",
      ".playPauseBtn",
      ".mwPlayPauseControl",
      "button[title='Play clip']",
      "button[aria-label='Play clip']",
      ".icon-play",
      ".vjs-big-play-button",
      "[aria-label*='Play']",
      "[title*='Play']"
    ];

    for (const selector of selectors) {
      const controls = root.querySelectorAll(selector);
      for (const control of controls) {
        if (!(control instanceof HTMLElement)) {
          continue;
        }

        if (control.getAttribute(CLICKED_FLAG) === "true") {
          continue;
        }

        if (dispatchRealClick(control)) {
          control.setAttribute(CLICKED_FLAG, "true");
          log("Clicked play control", selector);
        }
      }
    }
  }

  async function autoplayVideos(root) {
    const videos = root.querySelectorAll("video");
    for (const video of videos) {
      await attemptPlay(video);
    }

    clickPlayControls(root);
  }

  function scheduleAutoplay(root) {
    for (const delay of RETRY_DELAYS_MS) {
      window.setTimeout(() => {
        autoplayVideos(root).catch((error) => {
          log("Autoplay pass failed", error);
        });
      }, delay);
    }
  }

  function bindVideo(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    if (isKalturaPage()) {
      return;
    }

    if (video.getAttribute(AUTOPLAY_FLAG) === "true") {
      return;
    }

    video.setAttribute(AUTOPLAY_FLAG, "true");

    let retryTimer = null;
    const rerun = () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }

      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (!video.isConnected || video.ended) {
          return;
        }

        if (!hasPlayableSource(video) && video.readyState < HTMLMediaElement.HAVE_METADATA) {
          return;
        }

        attemptPlay(video).catch((error) => {
          log("Bound video retry failed", error);
        });
      }, 250);
    };

    const rerunIfPaused = () => {
      if (!video.ended && video.paused) {
        rerun();
      }
    };

    video.addEventListener("loadedmetadata", rerun);
    video.addEventListener("loadeddata", rerun);
    video.addEventListener("canplay", rerun);
    video.addEventListener("canplaythrough", rerun);
    video.addEventListener("play", () => {
      if (video.paused) {
        rerun();
      }
    });
    video.addEventListener("pause", rerunIfPaused);
    video.addEventListener("emptied", rerun);
    video.addEventListener("suspend", rerunIfPaused);

    rerun();
  }

  function bindExistingVideos() {
    document.querySelectorAll("video").forEach(bindVideo);
  }

  function observeDom() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches("video")) {
            bindVideo(node);
          }

          node.querySelectorAll?.("video").forEach(bindVideo);
          scheduleAutoplay(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    injectPageScript();
    bindEndedNavigationListener();
    bindExistingVideos();
    scheduleAutoplay(document);
    observeDom();

    window.addEventListener("load", () => {
      injectPageScript();
      bindExistingVideos();
      scheduleAutoplay(document);
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        injectPageScript();
        bindExistingVideos();
        scheduleAutoplay(document);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
