(() => {
  if (window.__fzfBrowserTabsInjected) return;
  window.__fzfBrowserTabsInjected = true;

  let container = null;

  const close = () => {
    if (!container) return;

    const { dialog } = container;
    if (dialog && dialog.open) dialog.close();
  };

  const show = async (incomingTabs, currentTabID) => {
    if (container) {
      container.input.focus();
      container.input.select();
      return;
    }

    const tabs = [];

    if (!Array.isArray(incomingTabs)) {
      console.warn("fzf-browser-tabs: something went wrong with tabs");
      return;
    }

    for (const t of incomingTabs) {
      if (!t || t.id === null) continue;
      if (t.id === currentTabID) continue;

      tabs.push(t);
    }

    const host = document.createElement("div");
    host.setAttribute("data-fzf-browser-tabs", "");
    const shadow = host.attachShadow({ mode: "open", delegatesFocus: true });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      dialog {
        border: 0;
        padding: 14px;
        border-radius: 12px;
        background: #1e1e1e;
        color: #eee;
        box-shadow: 0 24px 64px rgba(0,0,0,0.55);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        width: min(720px, 92vw);
        max-height: 75vh;
      }
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.45);
      }
      #search {
        width: 100%;
        padding: 14px 16px;
        font-size: 20px;
        background: #2a2a2a;
        color: #eee;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        outline: none;
        font-family: inherit;
      }
      #search:focus { border-color: #4a90e2; }
      #results {
        list-style: none;
        padding: 0;
        margin: 10px 0 0 0;
        overflow-y: auto;
        flex: 1 1 auto;
      }
      #results li {
        padding: 12px 14px;
        cursor: pointer;
        border-radius: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 16px;
        line-height: 1.4;
      }
      #results li.selected {
        background: #4a90e2;
        color: #fff;
      }
      .favicon {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
      }
      .title { overflow: hidden; text-overflow: ellipsis; }
      .empty {
        padding: 20px;
        text-align: center;
        opacity: 0.5;
        font-size: 15px;
      }
    `;
    shadow.appendChild(style);

    const dialog = document.createElement("dialog");
    shadow.appendChild(dialog);

    const input = document.createElement("input");
    input.id = "search";
    input.type = "text";
    input.placeholder = "Search tabs...";
    input.spellcheck = false;
    input.autocomplete = "off";
    dialog.appendChild(input);

    const results = document.createElement("ul");
    results.id = "results";
    dialog.appendChild(results);

    document.documentElement.appendChild(host);
    dialog.showModal();

    let selectedIndex = 0;
    let currentItems = tabs;

    const ensureSelectionVisible = () => {
      const selected = results.children[selectedIndex];
      if (selected && typeof selected.scrollIntoView === "function") {
        selected.scrollIntoView({ block: "nearest" });
      }
    };

    const render = (items) => {
      currentItems = items;
      if (items.length === 0) {
        selectedIndex = 0;
      } else if (selectedIndex >= items.length) {
        selectedIndex = items.length - 1;
      }

      while (results.firstChild) {
        results.removeChild(results.firstChild);
      }

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No matching tabs";
        results.appendChild(empty);
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const tab = items[i];
        const li = document.createElement("li");
        if (i === selectedIndex) li.classList.add("selected");
        li.dataset.tabId = String(tab.id);
        li.dataset.windowId = String(tab.windowId);

        if (tab.favIconUrl) {
          const img = document.createElement("img");
          img.src = tab.favIconUrl;
          img.className = "favicon";
          li.appendChild(img);
        }

        const title = document.createElement("span");
        title.className = "title";
        title.textContent = tab.title || tab.url || "(untitled)";
        li.appendChild(title);

        results.appendChild(li);
      }

      ensureSelectionVisible();
    };

    const select = async (idx) => {
      const target = (idx == null) ? selectedIndex : idx;
      const tab = currentItems[target];

      if (!tab) return;

      const tabId = tab.id;
      const windowId = tab.windowId;
      close();
      try {
        await browser.runtime.sendMessage({
          type: "switch-tab",
          tabId,
          windowId,
        });
      } catch (e) {
        console.error("fzf-browser-tabs: failed to switch tab", e);
      }
    };

    const moveSelection = (delta) => {
      if (currentItems.length === 0) return;
      const len = currentItems.length;
      selectedIndex = (selectedIndex + delta + len) % len;
      for (let i = 0; i < results.children.length; i++) {
        results.children[i].classList.toggle("selected", i === selectedIndex);
      }
      ensureSelectionVisible();
    };

    render(tabs);
    input.focus();

    const onFocusIn = (e) => {
      if (!container) return;
      if (shadow.contains(e.target)) return;
      input.focus();
    };
    document.addEventListener("focusin", onFocusIn, true);

    container = { host, dialog, shadow, input, focusinHandler: onFocusIn };

    dialog.addEventListener("close", () => {
      if (!container) return;
      const { host: h, focusinHandler } = container;
      if (focusinHandler) {
        document.removeEventListener("focusin", focusinHandler, true);
      }
      h.remove();
      container = null;
    });

    input.addEventListener("input", () => {
      const query = input.value.trim();

      if (!query) {
        selectedIndex = 0;
        render(tabs);
        return;
      }

      const needle = query.toLowerCase();

      const filtered = [];
      for (const t of tabs) {
        const title = (t.title || "").toLowerCase();
        const url = (t.url || "").toLowerCase();
        if (title.indexOf(needle) !== -1 || url.indexOf(needle) !== -1) {
          filtered.push(t);
        }
      }

      selectedIndex = 0;
      render(filtered);
    });

    // Specific workaround to input not seeing Escape keydown
    input.addEventListener("blur", close);

    input.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveSelection(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveSelection(-1);
          break;
        case "Enter":
          e.preventDefault();
          select();
          break;
        case "Tab":
          e.preventDefault();
          moveSelection(e.shiftKey ? -1 : 1);
          break;
      }
    });

    // Event listener to go to selected tab
    results.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;

      e.preventDefault();
      const childIndex = results.children.indexOf(li);
      select(childIndex);
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });
  };

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type !== "show-switcher") return;

    show(msg.tabs, msg.currentTabID);
  });
})();
