import "../../shared/browser.ts";
import { createTabStore } from "../../shared/tab-cache.ts";
import { orderTabsByRecency } from "../../shared/tab-ordering.ts";
import { buildShowSwitcherPayload } from "../../shared/messages.ts";

// Firefox background entry (event page). Keeps the debounced cache refresh:
// setTimeout survives on Firefox's persistent/event page, unlike on Chrome's
// service worker. Shared state and ordering live in ../shared/* — this file
// is only wiring.
const store = createTabStore();

function queryAllTabs() {
  return browser.tabs.query({});
}

const CACHE_DEBOUNCE_MS = 120;
let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

function scheduleCacheRefresh(): void {
  if (pendingRefresh !== null) return;

  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    void store.refresh(queryAllTabs);
  }, CACHE_DEBOUNCE_MS);
}

// Prime the cache at startup so the first open has warm state.
void store.refresh(queryAllTabs);

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
  const tabs = await store.refresh(queryAllTabs);
  store.touch(activeTab.id);

  const payload = buildShowSwitcherPayload(
    orderTabsByRecency(tabs, store.recentTabs),
    activeTab.id,
  );

  try {
    await browser.tabs.sendMessage(activeTab.id, payload);
    store.switcherTabs.add(activeTab.id);
    return;
  } catch {
    // content script not injected on this tab — inject it on demand
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content.js"],
    });
    await browser.tabs.sendMessage(activeTab.id, payload);
    store.switcherTabs.add(activeTab.id);
  } catch (e) {
    console.error("fzf-browser-tabs: cannot inject content script", e);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "switch-tab") {
    return (async () => {
      try {
        if (msg.tabId != null) store.touch(msg.tabId);

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
    store.switcherTabs.delete(msg.tabId);
    return false;
  }

  return false;
});

// Keep the cache warm: refresh when tabs are opened, closed, focused,
// moved, or retitled.
browser.tabs.onCreated.addListener(() => {
  scheduleCacheRefresh();
});

browser.tabs.onRemoved.addListener((tabId: number) => {
  store.switcherTabs.delete(tabId);
  store.recentTabs.delete(tabId);
  scheduleCacheRefresh();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo && activeInfo.tabId != null) {
    store.touch(activeInfo.tabId);
  }
  scheduleCacheRefresh();
});

browser.tabs.onMoved.addListener(() => {
  scheduleCacheRefresh();
});

browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // onUpdated fires several times per navigation (loading -> complete);
  // only list-relevant changes warrant a refresh.
  if (
    changeInfo.title === undefined &&
    changeInfo.favIconUrl === undefined &&
    changeInfo.url === undefined
  ) {
    return;
  }

  scheduleCacheRefresh();
});
