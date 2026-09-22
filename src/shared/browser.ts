// Runtime shim so the shared `browser` global also resolves on Chrome.
// Chrome 148+ provides `browser` natively; older Chrome only has `chrome`.
// Import this module for its side effect before any `browser.*` usage —
// both background entries and the content script do so as their first import.
const scope = globalThis as unknown as {
  browser?: unknown;
  chrome?: unknown;
};

if (scope.browser == null && scope.chrome != null) {
  scope.browser = scope.chrome;
}
