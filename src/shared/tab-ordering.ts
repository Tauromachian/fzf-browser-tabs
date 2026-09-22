import type { LRU } from "./LRU.ts";
import type { FzfTab } from "./types.ts";

// Order tabs most-recently-used first; never-touched tabs keep query order
// at the end. Tab data always comes from the fresh query — only the ordering
// comes from the MRU list.
export function orderTabsByRecency(
  tabs: FzfTab[],
  recentTabs: LRU<{ id: number }>,
): FzfTab[] {
  const byId = new Map<number, FzfTab>();

  for (const tab of tabs) {
    if (tab && tab.id != null) byId.set(tab.id, tab);
  }

  const ordered: FzfTab[] = [];

  for (const entry of recentTabs) {
    const tab = byId.get(entry.id);
    if (!tab) continue;

    ordered.push(tab);
    byId.delete(entry.id);
  }

  for (const tab of byId.values()) {
    ordered.push(tab);
  }

  return ordered;
}
