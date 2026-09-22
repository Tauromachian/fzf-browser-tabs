import "../../shared/browser.ts";
import { createTabStore } from "../../shared/tab-cache.ts";
import { orderTabsByRecency } from "../../shared/tab-ordering.ts";
import { buildShowSwitcherPayload } from "../../shared/messages.ts";

// Chrome background entry (service worker). Service workers can be killed at
// any time, so this entry must not rely on module-level timers or startup
// side effects:
// - No cache pre-warm at startup (the worker may start just to deliver one
//   event and stop again).
// - No setTimeout debounce: timers are cancelled when the worker is killed,
//   so tab events refresh the cache directly. Events are infrequent enough
//   that a debounce buys nothing here.
// - MRU state is ephemeral: it rebuilds each worker lifetime. If ordering
//   loss after eviction becomes annoying, persist it via storage.session.
// Shared state and ordering live in ../shared/* — this file is only wiring.
const store = createTabStore();

function queryAllTabs() {
  return browser.tabs.query({});
}

function scheduleCacheRefresh(): void {
  void store.refresh(queryAllTabs);
}

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

  // Refresh state at open and serve the switcher from it.
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
