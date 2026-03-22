# Canvas Kaltura Autoplay

This Chrome extension automatically starts videos on Canvas pages that embed Kaltura players, attempts to start them with audio unmuted, and can move to the next Canvas module item after a video finishes.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `chrome-extension-autoplay`.

## What It Does

- Runs on Canvas pages and Kaltura iframe pages.
- Watches for late-loaded players and videos.
- Uses the Kaltura player API to start embedded videos.
- Attempts to unmute the Kaltura player after autoplay starts.
- Falls back to generic autoplay behavior on non-Kaltura video pages that match the extension.
- When a Kaltura video ends, it navigates to the Canvas `Next Module Item` link once.
- Waits 2 seconds before moving to the next module item.

## Notes

- If Chrome blocks autoplay with audio, the extension may start the video muted. That is a browser policy limitation rather than a Canvas limitation.
- Auto-advance only works when the page has the standard Canvas module navigation footer with a `Next Module Item` link.
- The extension is intentionally simple and does not require any special permissions beyond the matched sites.
