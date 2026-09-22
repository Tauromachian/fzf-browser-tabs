import type { FzfTab } from "./types.ts";

// Validate the incoming tab list and drop the tab that opened the switcher
// (switching to yourself would be a no-op).
export function excludeCurrentTab(
  incomingTabs: unknown,
  currentTabID: unknown,
): FzfTab[] {
  const tabs: FzfTab[] = [];

  if (!Array.isArray(incomingTabs)) {
    console.warn("fzf-browser-tabs: something went wrong with tabs");
    return tabs;
  }

  for (const entry of incomingTabs) {
    if (entry === null || typeof entry !== "object") continue;
    const t = entry as FzfTab;
    if (t.id == null) continue;
    if (t.id === currentTabID) continue;

    tabs.push(t);
  }

  return tabs;
}

// Substring match (case-insensitive) against tab title and URL. Empty query
// returns the full list.
export function filterTabs(tabs: FzfTab[], query: string): FzfTab[] {
  const trimmed = query.trim();

  if (!trimmed) return tabs;

  const needle = trimmed.toLowerCase();
  const filtered: FzfTab[] = [];

  for (const t of tabs) {
    const title = (t.title ?? "").toLowerCase();
    const url = (t.url ?? "").toLowerCase();
    if (title.indexOf(needle) !== -1 || url.indexOf(needle) !== -1) {
      filtered.push(t);
    }
  }

  return filtered;
}
