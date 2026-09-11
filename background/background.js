// Global tab state. The background owns the canonical list: it is refreshed
// every time the switcher opens and kept warm by tab-event listeners in
// between, so open always serves a fresh list without extra round-trips.
// Content scripts cannot see browser.tabs events, so the background also
// fans the cached list out to open switchers (pruned on send failure).
let cachedTabs = [];

// Tabs currently showing the switcher overlay.
const switcherTabs = new Set();

// MRU ordering of tab ids, most-recently-used first. Ported from
// src/LRU.ts (source of truth — keep the detach/prepend logic in sync).
// In-memory only: order rebuilds each session.
class MruList {
  constructor() {
    this.head = undefined;
    this.tail = undefined;
    this.lookup = new Map();
    this.length = 0;
  }

  get size() {
    return this.length;
  }

  has(id) {
    return this.lookup.has(id);
  }

  touch(id) {
    const existing = this.lookup.get(id);
    if (existing) {
      this.detach(existing);
      this.prepend(existing);
      return;
    }
    this.prepend({ id, prev: undefined, next: undefined });
  }

  delete(id) {
    const node = this.lookup.get(id);
    if (!node) return false;
    this.detach(node);
    return true;
  }

  detach(node) {
    this.lookup.delete(node.id);
    this.length--;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = undefined;
    node.next = undefined;
  }

  prepend(node) {
    this.lookup.set(node.id, node);
    this.length++;

    node.prev = undefined;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    } else {
      this.tail = node;
    }

    this.head = node;
  }

  [Symbol.iterator]() {
    let current = this.head;

    return {
      next() {
        if (!current) return { value: undefined, done: true };

        const tmp = current;
        current = current?.next;
        return { value: tmp.id, done: false };
      },
    };
  }
}

const recentTabs = new MruList();

const CACHE_DEBOUNCE_MS = 120;
let pendingRefresh = null;

async function refreshTabsCache() {
  try {
    cachedTabs = await browser.tabs.query({});
  } catch (e) {
    console.error("fzf-browser-tabs: failed to query tabs", e);
  }
  // Drop ids that no longer exist so the MRU list stays bounded.
  const known = new Set();
  for (const tab of cachedTabs) {
    if (tab && tab.id != null) known.add(tab.id);
  }

  for (const id of recentTabs) {
    if (!known.has(id)) recentTabs.delete(id);
  }

  return cachedTabs;
}

// Order tabs most-recently-used first; never-touched tabs keep window
// order at the end. Tab data always comes from the fresh query — only
// the ordering comes from the MRU list.
function orderTabsByRecency(tabs) {
  const byId = new Map();

  for (const tab of tabs) {
    if (tab && tab.id != null) byId.set(tab.id, tab);
  }

  const ordered = [];

  for (const id of recentTabs) {
    const tab = byId.get(id);
    if (tab) {
      ordered.push(tab);
      byId.delete(id);
    }
  }

  for (const tab of tabs) {
    if (tab && tab.id != null && byId.has(tab.id)) ordered.push(tab);
  }

  return ordered;
}

function scheduleCacheRefresh() {
  if (pendingRefresh !== null) return;

  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    void refreshTabsCache();
  }, CACHE_DEBOUNCE_MS);
}

// Prime the cache at startup so the first open has warm state.
void refreshTabsCache();

browser.commands.onCommand.addListener(async (command) => {
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
  recentTabs.touch(activeTab.id);

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
        if (msg.tabId != null) recentTabs.touch(msg.tabId);

        await browser.tabs.update(msg.tabId, { active: true });
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

browser.tabs.onRemoved.addListener((tabId) => {
  switcherTabs.delete(tabId);
  recentTabs.delete(tabId);
  scheduleCacheRefresh();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo && activeInfo.tabId != null) {
    recentTabs.touch(activeInfo.tabId);
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
