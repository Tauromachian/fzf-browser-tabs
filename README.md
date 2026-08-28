# fzf-browser-tabs

A Firefox WebExtension that lets you fuzzy-find and switch between browser tabs, `fzf`-style.

Press the shortcut, type to filter, hit enter to jump to the matching tab.

## Features

- Fuzzy search across tab titles and URLs (case-insensitive substring match)
- Keyboard-driven: navigate with `Up`/`Down`/`Tab`, select with `Enter`, dismiss with `Esc`
- Shows the current tab in the list
- Injects on demand into pages that didn't load the content script at startup
- Self-contained overlay rendered in a closed Shadow DOM (no page CSS leakage)

## Install (temporary, in Firefox)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` in this repository.

The extension stays loaded until Firefox restarts.

## Usage

Trigger the tab switcher with the default shortcut:

- Linux / Windows: `Ctrl+Alt+K`
- macOS: `Command+Alt+K`

The shortcut can be remapped at `about:addons` → this extension → **Manage keyboard shortcuts**.

## Project layout

```
manifest.json          # WebExtension manifest (Manifest V3, gecko)
background/
  background.js        # Command listener, tab query, tab switching
content/
  content.js           # Overlay UI, fuzzy filter, keyboard handling
```

## Permissions

- `tabs` — query and update tabs
- `scripting` — inject the content script on demand into pages where it didn't load
- `<all_urls>` — required to inject on every page

## Notes

- Targets Firefox 109+ (`strict_min_version` in `manifest.json`).
- The extension id is `fzf-browser-tabs@example.com`, so a signed release would need to be re-keyed.
