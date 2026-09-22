// Shared extension types. Single source of truth for tab shapes, message
// shapes, and the browser API surface used by both background domains and
// the content domain. Browser-specific code must not redeclare these.

export type FzfTab = {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

export type TabQueryInfo = {
  active?: boolean;
  currentWindow?: boolean;
};

export type BrowserTabs = {
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

export type BrowserCommands = {
  onCommand: { addListener(cb: (command: string) => void): void };
};

export type BackgroundRuntime = {
  onMessage: {
    addListener(
      cb: (
        msg: { type?: unknown; tabId?: number; windowId?: number },
      ) => unknown,
    ): void;
  };
};

export type SwitchTabPayload = {
  type: "switch-tab";
  tabId: number;
  windowId?: number;
};

export type ContentRuntime = {
  sendMessage(message: SwitchTabPayload): Promise<unknown>;
  onMessage: {
    addListener(callback: (msg: ShowSwitcherMessage) => void): void;
  };
};

export type BrowserScripting = {
  executeScript(opts: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
};

export type BrowserWindows = {
  update(windowId: number, props: { focused: boolean }): Promise<unknown>;
};

export type ShowSwitcherMessage = {
  type?: unknown;
  tabs?: unknown;
  currentTabID?: unknown;
};

declare global {
  const browser: {
    tabs: BrowserTabs;
    commands: BrowserCommands;
    runtime: BackgroundRuntime & ContentRuntime;
    scripting: BrowserScripting;
    windows: BrowserWindows;
  };
}
