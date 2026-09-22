import { LRU } from "./LRU.ts";
import type { FzfTab } from "./types.ts";

// Background-owned tab state shared by both browser domains. Each background
// entry creates its own store via `createTabStore()` — state is never shared
// across domains. The query function is injected so the store stays testable
// without a `browser` global.
export type TabStore = ReturnType<typeof createTabStore>;

export function createTabStore() {
  // Canonical list, refreshed every time the switcher opens and kept warm
  // by tab-event listeners in between.
  let cachedTabs: FzfTab[] = [];

  // Tabs currently showing the switcher overlay.
  const switcherTabs = new Set<number>();

  // MRU ordering of tab ids, most-recently-used first. In-memory only:
  // order rebuilds each session (and each service-worker restart on Chrome).
  const recentTabs = new LRU<{ id: number }>();

  function touch(id: number): void {
    recentTabs.add({ id });
  }

  async function refresh(
    queryAll: () => Promise<FzfTab[]>,
  ): Promise<FzfTab[]> {
    try {
      cachedTabs = await queryAll();
    } catch (e) {
      console.error("fzf-browser-tabs: failed to query tabs", e);
    }
    // Drop ids that no longer exist so the MRU list stays bounded.
    const known = new Set<number>();
    for (const tab of cachedTabs) {
      if (tab && tab.id != null) known.add(tab.id);
    }

    // Snapshot via toArray(): deleting during live iteration would clear
    // node.next in detach() and truncate the generator walk.
    for (const entry of recentTabs.toArray()) {
      if (!known.has(entry.id)) recentTabs.delete(entry.id);
    }

    return cachedTabs;
  }

  return {
    touch,
    refresh,
    switcherTabs,
    recentTabs,
    get cachedTabs(): FzfTab[] {
      return cachedTabs;
    },
  };
}
