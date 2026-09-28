import type { FzfTab } from "../shared/types.ts";

export type SwitcherElements = {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  dialog: HTMLDialogElement;
  input: HTMLInputElement;
  results: HTMLUListElement;
};

const SWITCHER_STYLES = `
      :host {
        all: initial;
        --fzf-dialog-bg: #1e1e1e;
        --fzf-dialog-fg: #eee;
        --fzf-dialog-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
        --fzf-backdrop-bg: rgba(0, 0, 0, 0.45);
        --fzf-input-bg: #2a2a2a;
        --fzf-input-fg: #eee;
        --fzf-input-border: #3a3a3a;
        --fzf-accent: #4a90e2;
        --fzf-accent-fg: #fff;
      }
      * { box-sizing: border-box; }
      dialog {
        border: 0;
        padding: 14px;
        border-radius: 12px;
        background: var(--fzf-dialog-bg);
        color: var(--fzf-dialog-fg);
        box-shadow: var(--fzf-dialog-shadow);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        width: min(720px, 92vw);
        max-height: 75vh;
      }
      dialog::backdrop {
        background: var(--fzf-backdrop-bg);
      }
      #search {
        width: 100%;
        padding: 14px 16px;
        font-size: 20px;
        background: var(--fzf-input-bg);
        color: var(--fzf-input-fg);
        border: 1px solid var(--fzf-input-border);
        border-radius: 8px;
        outline: none;
        font-family: inherit;
      }
      #search:focus { border-color: var(--fzf-accent); }
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
        background: var(--fzf-accent);
        color: var(--fzf-accent-fg);
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

export function createSwitcherUI(): SwitcherElements {
  const host: HTMLDivElement = document.createElement("div");
  host.setAttribute("data-fzf-browser-tabs", "");
  const shadow: ShadowRoot = host.attachShadow({
    mode: "open",
    delegatesFocus: true,
  });

  const style: HTMLStyleElement = document.createElement("style");
  style.textContent = SWITCHER_STYLES;
  shadow.appendChild(style);

  const dialog: HTMLDialogElement = document.createElement("dialog");
  shadow.appendChild(dialog);

  const input: HTMLInputElement = document.createElement("input");
  input.id = "search";
  input.type = "text";
  input.placeholder = "Search tabs...";
  input.spellcheck = false;
  input.autocomplete = "off";
  dialog.appendChild(input);

  const results: HTMLUListElement = document.createElement("ul");
  results.id = "results";
  dialog.appendChild(results);

  document.documentElement.appendChild(host);
  dialog.showModal();

  return { host, shadow, dialog, input, results };
}

function createEmptyState(): HTMLDivElement {
  const empty: HTMLDivElement = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "No matching tabs";
  return empty;
}

function createResultRow(tab: FzfTab, selected: boolean): HTMLLIElement {
  const li: HTMLLIElement = document.createElement("li");
  if (selected) li.classList.add("selected");
  li.dataset.tabId = String(tab.id);
  li.dataset.windowId = String(tab.windowId);

  if (tab.favIconUrl) {
    const img: HTMLImageElement = document.createElement("img");
    img.src = tab.favIconUrl;
    img.className = "favicon";
    li.appendChild(img);
  }

  const title: HTMLSpanElement = document.createElement("span");
  title.className = "title";
  title.textContent = tab.title || tab.url || "(untitled)";
  li.appendChild(title);

  return li;
}

export function renderResults(
  results: HTMLUListElement,
  items: FzfTab[],
  selectedIndex: number,
): void {
  while (results.firstChild) {
    results.removeChild(results.firstChild);
  }

  if (items.length === 0) {
    results.appendChild(createEmptyState());
    return;
  }

  for (let i = 0; i < items.length; i++) {
    results.appendChild(createResultRow(items[i], i === selectedIndex));
  }
}
