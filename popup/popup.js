const searchEl = document.getElementById("search");
const resultsEl = document.getElementById("results");

function render(tabs) {
  while (resultsEl.firstChild) {
    resultsEl.removeChild(resultsEl.firstChild);
  }
  for (const tab of tabs) {
    const li = document.createElement("li");
    li.dataset.tabId = tab.id;

    if (tab.favIconUrl) {
      const img = document.createElement("img");
      img.src = tab.favIconUrl;
      img.className = "favicon";
      li.appendChild(img);
    }

    li.appendChild(document.createTextNode(tab.title || tab.url));
    resultsEl.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  searchEl.focus();

  const tabs = await browser.tabs.query({});
  render(tabs);

  searchEl.addEventListener("input", () => {
    const query = searchEl.value.trim();
    if (!query) {
      render(tabs);
      return;
    }
    // TODO: replace with a real fuzzy matcher (e.g. fzf-style subsequence)
    const needle = query.toLowerCase();
    const filtered = [];
    for (const t of tabs) {
      const title = (t.title || "").toLowerCase();
      const url = (t.url || "").toLowerCase();
      if (title.indexOf(needle) !== -1 || url.indexOf(needle) !== -1) {
        filtered.push(t);
      }
    }
    render(filtered);
  });

  resultsEl.addEventListener("click", async (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const tabId = Number(li.dataset.tabId);
    await browser.tabs.update(tabId, { active: true });
    const tab = await browser.tabs.get(tabId);
    if (tab.windowId) {
      await browser.windows.update(tab.windowId, { focused: true });
    }
    window.close();
  });
});
