import { createSwitcherUI, renderResults } from "./switcher-ui.ts";

export type FzfTab = {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

type ShowSwitcherMessage = {
  type?: unknown;
  tabs?: unknown;
  currentTabID?: unknown;
};

type SwitchTabPayload = {
  type: "switch-tab";
  tabId: number;
  windowId?: number;
};

type SwitcherContainer = {
  host: HTMLDivElement;
  dialog: HTMLDialogElement;
  shadow: ShadowRoot;
  input: HTMLInputElement;
  focusinHandler: (e: FocusEvent) => void;
};

type BrowserRuntime = {
  sendMessage(message: SwitchTabPayload): Promise<unknown>;
  onMessage: {
    addListener(callback: (msg: ShowSwitcherMessage) => void): void;
  };
};

declare global {
  // Must stay an interface: type aliases cannot augment the global Window.
  interface Window {
    __fzfBrowserTabsInjected?: boolean;
  }

  const browser: { runtime: BrowserRuntime };
}

(() => {
  // deno-lint-ignore no-window -- content script intentionally uses the page window as re-injection guard
  if (window.__fzfBrowserTabsInjected) return;
  // deno-lint-ignore no-window -- content script intentionally uses the page window as re-injection guard
  window.__fzfBrowserTabsInjected = true;

  let container: SwitcherContainer | null = null;

  const close = (): void => {
    if (!container) return;

    const { dialog } = container;
    if (dialog && dialog.open) dialog.close();
  };

  // deno-lint-ignore require-await -- kept async to preserve the Promise<void> signature
  const show = async (
    incomingTabs: unknown,
    currentTabID: unknown,
  ): Promise<void> => {
    if (container) {
      container.input.focus();
      container.input.select();
      return;
    }

    const tabs: FzfTab[] = [];

    if (!Array.isArray(incomingTabs)) {
      console.warn("fzf-browser-tabs: something went wrong with tabs");
      return;
    }

    for (const entry of incomingTabs) {
      if (entry === null || typeof entry !== "object") continue;
      const t = entry as FzfTab;
      if (t.id == null) continue;
      if (t.id === currentTabID) continue;

      tabs.push(t);
    }

    const { host, shadow, dialog, input, results } = createSwitcherUI();

    let selectedIndex = 0;
    let currentItems: FzfTab[] = tabs;

    const ensureSelectionVisible = (): void => {
      const selected: Element | undefined = results.children[selectedIndex];
      if (selected && typeof selected.scrollIntoView === "function") {
        selected.scrollIntoView({ block: "nearest" });
      }
    };

    const render = (items: FzfTab[]): void => {
      currentItems = items;
      if (items.length === 0) {
        selectedIndex = 0;
      } else if (selectedIndex >= items.length) {
        selectedIndex = items.length - 1;
      }

      renderResults(results, items, selectedIndex);

      ensureSelectionVisible();
    };

    const select = async (idx?: number): Promise<void> => {
      const target: number = idx ?? selectedIndex;
      const tab: FzfTab | undefined = currentItems[target];

      if (!tab) return;

      const tabId: number | undefined = tab.id;
      if (tabId == null) return;

      const windowId: number | undefined = tab.windowId ?? undefined;
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

    const moveSelection = (delta: number): void => {
      if (currentItems.length === 0) return;
      const len: number = currentItems.length;
      selectedIndex = (selectedIndex + delta + len) % len;
      for (let i = 0; i < results.children.length; i++) {
        results.children[i].classList.toggle("selected", i === selectedIndex);
      }
      ensureSelectionVisible();
    };

    render(tabs);
    input.focus();

    const onFocusIn = (e: FocusEvent): void => {
      if (!container) return;
      if (shadow.contains(e.target as Node | null)) return;
      input.focus();
    };
    document.addEventListener("focusin", onFocusIn, true);

    container = { host, dialog, shadow, input, focusinHandler: onFocusIn };

    dialog.addEventListener("close", (): void => {
      if (!container) return;
      const { host: h, focusinHandler } = container;
      if (focusinHandler) {
        document.removeEventListener("focusin", focusinHandler, true);
      }
      h.remove();
      container = null;
    });

    input.addEventListener("input", (): void => {
      const query: string = input.value.trim();

      if (!query) {
        selectedIndex = 0;
        render(tabs);
        return;
      }

      const needle: string = query.toLowerCase();

      const filtered: FzfTab[] = [];
      for (const t of tabs) {
        const title: string = (t.title ?? "").toLowerCase();
        const url: string = (t.url ?? "").toLowerCase();
        if (title.indexOf(needle) !== -1 || url.indexOf(needle) !== -1) {
          filtered.push(t);
        }
      }

      selectedIndex = 0;
      render(filtered);
    });

    // Workaround to input not seeing Escape keydown
    let isClickOutside = true;
    dialog.addEventListener("mousedown", (e: MouseEvent): void => {
      const rect: DOMRect = dialog.getBoundingClientRect();

      isClickOutside = false;
      if (e.clientX < rect.left) isClickOutside = true;
      if (e.clientY < rect.top) isClickOutside = true;
      if (e.clientX > rect.left + rect.width) isClickOutside = true;
      if (e.clientY > rect.top + rect.height) isClickOutside = true;
    }, true);

    // Workaround to input not seeing Escape keydown
    input.addEventListener("blur", (): void => {
      if (isClickOutside) close();
    });

    input.addEventListener("keydown", (e: KeyboardEvent): void => {
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
          void select();
          break;
        case "Tab":
          e.preventDefault();
          moveSelection(e.shiftKey ? -1 : 1);
          break;
      }
    });

    // Event listener to go to selected tab
    results.addEventListener("mousedown", (e: MouseEvent): void => {
      const target = e.target as Element | null;
      const li: HTMLLIElement | null = target?.closest("li") as
        | HTMLLIElement
        | null;
      if (!li) return;

      e.preventDefault();
      const childIndex: number = [...results.children].indexOf(li);
      void select(childIndex);
    });

    dialog.addEventListener("click", (e: MouseEvent): void => {
      const target = e.target as Element | null;
      if (e.target === dialog && target?.closest("li")) close();
    });
  };

  browser.runtime.onMessage.addListener((msg: ShowSwitcherMessage): void => {
    if (!msg) return;
    if (msg.type !== "show-switcher") return;

    show(msg.tabs, msg.currentTabID);
  });
})();
