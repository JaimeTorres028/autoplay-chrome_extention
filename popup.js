(function () {
  const STORAGE_KEY = "playbackSpeed";
  const DEFAULT_SPEED = "1";

  const select = document.getElementById("playback-speed");
  const status = document.getElementById("status");

  function setStatus(message) {
    status.textContent = message;
    window.setTimeout(() => {
      status.textContent = "Saved for future video loads.";
    }, 1200);
  }

  chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SPEED }, (result) => {
    select.value = String(result[STORAGE_KEY] || DEFAULT_SPEED);
  });

  select.addEventListener("change", () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: select.value }, () => {
      setStatus(`Saved ${select.value}x`);
    });
  });
})();
