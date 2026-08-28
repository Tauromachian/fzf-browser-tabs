(() => {
  if (window.__fzfBrowserTabsInjected) return;
  window.__fzfBrowserTabsInjected = true;

  let container = null;

  const close = () => {
    if (container && overlay.parentNode) {
      container.parentNode.removeChild(overlay);
      container = null;
    }
  };

  const show = async (incomingTabs) => {
    if (container) {
      const existing = container.shadowRoot.querySelector("#search");
      if (existing) {
        existing.focus();
        existing.select();
      }
      return;
    }

    const tabs = [];
    if (Array.isArray(incomingTabs)) {
      for (const t of incomingTabs) {
        if (t && t.id != null) tabs.push(t);
      }
    }
    if (tabs.length === 0) {
      console.warn("fzf-browser-tabs: no tabs received");
      return;
    }

    const host = document.createElement("div");
    host.setAttribute("data-fzf-browser-tabs", "");
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(640px, 90vw);
        max-height: 70vh;
        background: #1e1e1e;
        color: #eee;
        border-radius: 10px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.55);
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      #search {
        width: 100%;
        padding: 10px 12px;
        font-size: 16px;
        background: #2a2a2a;
        color: #eee;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        outline: none;
        font-family: inherit;
      }
      #search:focus { border-color: #4a90e2; }
      #results {
        list-style: none;
        padding: 0;
        margin: 8px 0 0 0;
        overflow-y: auto;
        flex: 1 1 auto;
      }
      #results li {
        padding: 8px 10px;
        cursor: pointer;
        border-radius: 5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        line-height: 1.4;
      }
      #results li.selected {
        background: #4a90e2;
        color: #fff;
      }
      .favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .title { overflow: hidden; text-overflow: ellipsis; }
      .meta {
        opacity: 0.55;
        font-size: 11px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .empty {
        padding: 16px;
        text-align: center;
        opacity: 0.5;
        font-size: 13px;
      }
    `;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const panel = document.createElement("div");
    panel.className = "panel";
    backdrop.appendChild(panel);
    shadow.appendChild(backdrop);

    const input = document.createElement("input");
    input.id = "search";
    input.type = "text";
    input.placeholder = "Search tabs...";
    input.spellcheck = false;
    input.autocomplete = "off";
    panel.appendChild(input);

    const results = document.createElement("ul");
    results.id = "results";
    panel.appendChild(results);

    document.documentElement.appendChild(host);
    container = host;

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

        if (tab.active) {
          const meta = document.createElement("span");
          meta.className = "meta";
          meta.textContent = "current";
          li.appendChild(meta);
        }

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

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        select();
      } else if (e.key === "Tab") {
        e.preventDefault();
        moveSelection(e.shiftKey ? -1 : 1);
      }
    });

    results.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      const children = results.children;
      for (let i = 0; i < children.length; i++) {
        if (children[i] === li) {
          select(i);
          return;
        }
      }
    });

    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        close();
      }
    });
  };

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "show-switcher") {
      show(msg.tabs);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && container) {
      close();
    }
  }, true);
})();
