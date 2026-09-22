import type { FzfTab, ShowSwitcherMessage } from "./types.ts";

export type ShowSwitcherPayload = {
  type: "show-switcher";
  tabs: FzfTab[];
  currentTabID: number;
};

export function buildShowSwitcherPayload(
  tabs: FzfTab[],
  currentTabID: number,
): ShowSwitcherPayload {
  return { type: "show-switcher", tabs, currentTabID };
}

export function isShowSwitcherMessage(
  msg: ShowSwitcherMessage | null | undefined,
): msg is ShowSwitcherMessage & { tabs: unknown; currentTabID: unknown } {
  return !!msg && msg.type === "show-switcher";
}
