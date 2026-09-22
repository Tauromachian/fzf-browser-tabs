# fzf-browser-tabs

A Firefox + Chrome WebExtension (Manifest V3) that lets you fuzzy-find and switch between browser tabs, `fzf`-style.

Press the shortcut, type to filter, hit enter to jump to the matching tab.

## Features

- Fuzzy search across tab titles and URLs (case-insensitive substring match)
- Keyboard-driven: navigate with `Up`/`Down`/`Tab`, select with `Enter`, dismiss with `Esc`
- Hides the currently active tab from the list (so you can't no-op switch to yourself)
- Opens even when only one tab exists (single-tab fallback)
- Self-contained modal overlay rendered with the native `<dialog>` element in an open Shadow DOM — no page CSS leakage and no z-index wars with page popups
- Content script injects on demand into pages that didn't load it at startup
- Captures `Esc` natively via the dialog's close watcher

## Install (temporary)

Build first: `deno task build:firefox` and/or `deno task build:chrome`.
This assembles self-contained roots under `dist/firefox/` and `dist/chrome/`
(each holds its own `manifest.json` + `background.js` + `content.js`).

**Firefox:**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `dist/firefox/manifest.json`.

The extension stays loaded until Firefox restarts. For permanent install, the extension would need to be signed by Mozilla and the id re-keyed (`fzf-browser-tabs@example.com`).

**Chrome:**

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select `dist/chrome/`.

## Usage

Trigger the tab switcher with the default shortcut: `Ctrl+Space` on all
platforms and both browsers.

(`Ctrl+Alt` combos are banned on Chrome because of AltGr conflicts, and
`Alt`-based combos fight the browser menu focus, which is why the default
avoids them. Notes per platform: on macOS `Ctrl` auto-converts to `Command`,
so the binding becomes `Command+Space` (Spotlight) — macOS users should
remap; on Linux `Ctrl+Space` may be grabbed by IME frameworks like IBus —
remap if it doesn't fire.)

The shortcut can be remapped at `about:addons` → this extension → **Manage keyboard shortcuts**
(Firefox) or `chrome://extensions/shortcuts` (Chrome).

Once open:

| Key | Action |
|---|---|
| Type | Filter by title / URL (substring, case-insensitive) |
| `↑` / `↓` | Move selection |
| `Tab` / `Shift+Tab` | Move selection |
| `Enter` | Switch to selected tab |
| `Esc` | Close |
| Click backdrop | Close |
| Click a result | Switch to that tab |

## How it works

**Command flow:**

1. The user presses the shortcut.
2. The background entry (`src/browsers/firefox/background.ts` or `src/browsers/chrome/background.ts`, bundled to `dist/<browser>/background.js`) (`browser.commands.onCommand`) queries the active tab with `tabs.query({ active: true, currentWindow: true })`, then queries all tabs with `tabs.query({})`.
3. The background sends `{ type: "show-switcher", tabs, currentTabID }` to the active tab's content script. (`currentTabID` is the id of the tab that triggered the command — used to filter the user's own tab out of the list.)
4. If the content script isn't injected yet (e.g., the page loaded before the extension), the background falls back to `browser.scripting.executeScript` to inject `content.js` (bundled from `src/content/content.ts`), then re-sends the message.
5. The content script renders the modal overlay. Selecting a result sends `{ type: "switch-tab", tabId, windowId }` back; the background calls `tabs.update` and `windows.update`.

**Modal overlay (`src/content/content.ts` → `content.js`):**

- A `<div>` host element is appended to `document.documentElement` and given an open shadow root.
- Inside the shadow root, a `<dialog>` is created with input + results. Calling `dialog.showModal()` places it in the [top layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer) — above every page stacking context, no z-index tricks needed.
- When the dialog is in the modal state, the rest of the document is [inert](https://html.spec.whatwg.org/multipage/interaction.html#inert) — `element.focus()` calls from page popups (cookie consent banners, etc.) become no-ops, which solves focus theft without any per-frame bookkeeping.
- `Esc` is handled by the dialog's built-in close watcher; a single `close` event listener tears down the host and removes the focusin guard.
- A capture-phase `focusin` listener on `document` is kept as defense in depth — if anything outside the shadow tree ever gains focus, we pull it back to the search input.

**Filter:**

- Substring match (case-insensitive) against `tab.title` and `tab.url`. Not a real fzf fuzzy match.
- Empty query shows all tabs (minus the current one).

## Project layout

```
manifests/
  manifest.firefox.json   # Firefox MV3 manifest (background.scripts, gecko id, Ctrl+Alt+S)
  manifest.chrome.json    # Chrome MV3 manifest (background.service_worker, min Chrome 148, Ctrl+Shift+S)
src/
  shared/                 # Browser-agnostic logic: types, LRU, tab cache/ordering/filter, message shapes
  browsers/
    firefox/background.ts # Firefox background entry (event page, debounced cache refresh)
    chrome/background.ts  # Chrome background entry (service worker, no timers/startup pre-warm)
  content/
    content.ts            # Overlay lifecycle, keyboard/mouse handling (shared by both browsers)
    switcher-ui.ts        # Shadow-DOM modal factory + result rendering
scripts/
  check-manifests.ts      # `deno task check:manifests` — fails on name/version/permissions drift
  package-chrome.sh       # Zips dist/chrome/ for the Chrome Web Store
dist/
  firefox/                # Built Firefox root: manifest.json + background.js + content.js
  chrome/                 # Built Chrome root: manifest.json + background.js + content.js
```

One manifest per browser, one shared codebase: `browsers/*` and `content/*`
may import from `shared/*`; `shared/*` never imports browser-specific code;
the two browser domains never import each other.

## Permissions

- `tabs` — query and update tabs
- `scripting` — inject the content script on demand into pages where it didn't load
- `<all_urls>` — required to inject on every page

No `windows` permission — the active tab id comes from the command listener's `tabs.query` result, not from `browser.windows.getCurrent`.

## Notes

- Targets Firefox 109+ (`strict_min_version` in `manifests/manifest.firefox.json`)
  and Chrome 148+ (`minimum_chrome_version` in `manifests/manifest.chrome.json`,
  the first version with native `browser.*` promise-namespace support).
- Single source of truth for cleanup: the `close` event listener on the dialog. `close()` only invokes `dialog.close()`; everything else (host removal, focusin listener removal, container reset) runs from that listener.
- The current tab is hidden from the list by id match against `currentTabId`. With only one tab, the filter would empty the list — so the content script falls back to showing all tabs to keep the switcher responsive.
