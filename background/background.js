browser.commands.onCommand.addListener(async (command) => {
  if (command !== "open-tab-switcher") return;
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || activeTab.id == null) {
    console.warn("fzf-browser-tabs: no active tab");
    return;
  }

  let tabs;
  try {
    tabs = await browser.tabs.query({});
  } catch (e) {
    console.error("fzf-browser-tabs: failed to query tabs", e);
    return;
  }

  const payload = { type: "show-switcher", tabs };

  try {
    await browser.tabs.sendMessage(activeTab.id, payload);
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
  } catch (e) {
    console.error("fzf-browser-tabs: cannot inject content script", e);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "switch-tab") {
    return (async () => {
      try {
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
  return false;
});
