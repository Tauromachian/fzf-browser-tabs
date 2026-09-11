import { LRU } from "./LRU.ts";

export type FzfTab = {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

type TabQueryInfo = {
  active?: boolean;
  currentWindow?: boolean;
};

type BrowserTabs = {
  query(info: TabQueryInfo): Promise<FzfTab[]>;
  sendMessage(tabId: number, msg: unknown): Promise<unknown>;
  update(tabId: number, props: { active: boolean }): Promise<unknown>;
  onCreated: { addListener(cb: () => void): void };
  onRemoved: { addListener(cb: (tabId: number) => void): void };
  onActivated: {
    addListener(cb: (info: { tabId?: number }) => void): void;
  };
  onMoved: { addListener(cb: () => void): void };
  onUpdated: {
    addListener(
      cb: (
        tabId: number,
        changeInfo: {
          title?: string;
          favIconUrl?: string;
          url?: string;
        },
      ) => void,
    ): void;
  };
};

type BrowserCommands = {
  onCommand: { addListener(cb: (command: string) => void): void };
};

type BrowserRuntime = {
  onMessage: {
    addListener(
      cb: (
        msg: { type?: unknown; tabId?: number; windowId?: number },
      ) => unknown,
    ): void;
  };
};

type BrowserScripting = {
  executeScript(opts: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
};

type BrowserWindows = {
  update(windowId: number, props: { focused: boolean }): Promise<unknown>;
};

declare global {
  const browser: {
    tabs: BrowserTabs;
    commands: BrowserCommands;
    runtime: BrowserRuntime;
    scripting: BrowserScripting;
    windows: BrowserWindows;
  };
}

// Global tab state. The background owns the canonical list: it is refreshed
// every time the switcher opens and kept warm by tab-event listeners in
// between, so open always serves a fresh list without extra round-trips.
// Content scripts cannot see browser.tabs events, so the background also
// fans the cached list out to open switchers (pruned on send failure).
let cachedTabs: FzfTab[] = [];

// Tabs currently showing the switcher overlay.
const switcherTabs = new Set<number>();

// MRU ordering of tab ids, most-recently-used first. Single source of truth
// lives in ./LRU.ts — bundled into dist/background.js via deno bundle.
// In-memory only: order rebuilds each session.
const recentTabs = new LRU<{ id: number }>();

function touch(id: number): void {
  recentTabs.add({ id });
}

const CACHE_DEBOUNCE_MS = 120;
let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

async function refreshTabsCache(): Promise<FzfTab[]> {
  try {
    cachedTabs = await browser.tabs.query({});
  } catch (e) {
    console.error("fzf-browser-tabs: failed to query tabs", e);
  }
  // Drop ids that no longer exist so the MRU list stays bounded.
  const known = new Set<number>();
  for (const tab of cachedTabs) {
    if (tab && tab.id != null) known.add(tab.id);
  }

  // Snapshot via toArray(): deleting during live iteration would clear
  // node.next in detach() and truncate the generator walk.
  for (const entry of recentTabs.toArray()) {
    if (!known.has(entry.id)) recentTabs.delete(entry.id);
  }

  return cachedTabs;
}

// Sync + order tabs most-recently-used first; never-touched tabs keep window
// order at the end. Tab data always comes from the fresh query — only
// the ordering comes from the MRU list.
function orderTabsByRecency(tabs: FzfTab[]): FzfTab[] {
  const byId = new Map<number, FzfTab>();

  for (const tab of tabs) {
    if (tab && tab.id != null) byId.set(tab.id, tab);
  }

  const ordered: FzfTab[] = [];

  for (const entry of recentTabs) {
    const tab = byId.get(entry.id);
    if (!tab) continue;

    ordered.push(tab);
    byId.delete(entry.id);
  }

  for (const tab of byId.values()) {
    ordered.push(tab);
  }

  return ordered;
}

function scheduleCacheRefresh(): void {
  if (pendingRefresh !== null) return;

  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    void refreshTabsCache();
  }, CACHE_DEBOUNCE_MS);
}

// Prime the cache at startup so the first open has warm state.
void refreshTabsCache();

browser.commands.onCommand.addListener(async (command: string) => {
  if (command !== "open-tab-switcher") return;

  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab || activeTab.id == null) {
    console.warn("fzf-browser-tabs: no active tab");
    return;
  }

  // Refresh global state at open and serve the switcher from it.
  const tabs = await refreshTabsCache();
  touch(activeTab.id);

  const payload = {
    type: "show-switcher",
    tabs: orderTabsByRecency(tabs),
    currentTabID: activeTab.id,
  };

  try {
    await browser.tabs.sendMessage(activeTab.id, payload);
    switcherTabs.add(activeTab.id);
    return;
  } catch {
    // content script not injected on this tab — inject it on demand
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content/content.js"],
    });
    await browser.tabs.sendMessage(activeTab.id, payload);
    switcherTabs.add(activeTab.id);
  } catch (e) {
    console.error("fzf-browser-tabs: cannot inject content script", e);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "switch-tab") {
    return (async () => {
      try {
        if (msg.tabId != null) touch(msg.tabId);

        await browser.tabs.update(msg.tabId as number, { active: true });
        if (msg.windowId != null) {
          await browser.windows.update(msg.windowId, { focused: true });
        }
        return { ok: true };
      } catch (e) {
        console.error("fzf-browser-tabs: failed to switch tab", e);
        return { ok: false, error: String(e) };
      }
    })();
  }

  if (msg && msg.type === "switcher-closed" && msg.tabId != null) {
    switcherTabs.delete(msg.tabId);
    return false;
  }

  return false;
});

// Keep open switchers live: re-arrange the search list when tabs are
// opened, closed, focused, moved, or retitled while the overlay is up.
browser.tabs.onCreated.addListener(() => {
  scheduleCacheRefresh();
});

browser.tabs.onRemoved.addListener((tabId: number) => {
  switcherTabs.delete(tabId);
  recentTabs.delete(tabId);
  scheduleCacheRefresh();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo && activeInfo.tabId != null) {
    touch(activeInfo.tabId);
  }
  scheduleCacheRefresh();
});

browser.tabs.onMoved.addListener(() => {
  scheduleCacheRefresh();
});

browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // onUpdated fires several times per navigation (loading -> complete);
  // only list-relevant changes warrant a broadcast.
  if (
    changeInfo.title === undefined &&
    changeInfo.favIconUrl === undefined &&
    changeInfo.url === undefined
  ) {
    return;
  }

  scheduleCacheRefresh();
});
