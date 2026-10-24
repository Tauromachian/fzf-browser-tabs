import type { FzfTab } from "./types.ts";

// Validate the incoming tab list and drop the tab that opened the switcher
// (switching to yourself would be a no-op).
export function excludeCurrentTab(
  incomingTabs: unknown,
  currentTabID: unknown,
): FzfTab[] {
  const tabs: FzfTab[] = [];

  if (!Array.isArray(incomingTabs)) {
    console.warn("fzf-browser-tabs: something went wrong with tabs");
    return tabs;
  }

  for (const entry of incomingTabs) {
    if (entry === null || typeof entry !== "object") continue;
    const t = entry as FzfTab;
    if (t.id == null) continue;
    if (t.id === currentTabID) continue;

    tabs.push(t);
  }

  return tabs;
}

// Fuzzy match (case-insensitive, fzf-style) against tab title and URL.
// Empty query returns the full list in the given order. Non-empty queries
// split on whitespace into tokens; every token must fuzzy-match (subsequence
// in order) against the title or URL. Matches are ranked best-first; ties
// keep the incoming (MRU) order.
export function filterTabs(tabs: FzfTab[], query: string): FzfTab[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length === 0) return tabs;

  const scored: Array<{ tab: FzfTab; score: number; index: number }> = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    let total = 0;
    let matched = true;

    for (const token of tokens) {
      const s = scoreTabToken(token, title, url);
      if (s === null) {
        matched = false;
        break;
      }
      total += s;
    }

    if (matched) scored.push({ tab, score: total, index: i });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((s) => s.tab);
}

// Best fuzzy score for one lowercase token against title/URL (either field
// may match). Title matches get a small boost so e.g. a title hit outranks
// an equally good URL-only hit.
function scoreTabToken(
  tokenLower: string,
  title: string,
  url: string,
): number | null {
  const titleScore = title
    ? fuzzyScore(tokenLower, title, title.toLowerCase())
    : null;
  const urlScore = url ? fuzzyScore(tokenLower, url, url.toLowerCase()) : null;

  let best: number | null = null;
  if (titleScore !== null) best = titleScore + TITLE_BOOST;
  if (urlScore !== null) best = best === null ? urlScore : Math.max(best, urlScore);
  return best;
}

const SCORE_BASE = 10;
const SCORE_CONSECUTIVE = 12;
const SCORE_START = 10;
const SCORE_SEPARATOR = 8;
const SCORE_CAMEL = 6;
const GAP_INNER = -1;
const LEADING_PENALTY_PER_CHAR = 0.5;
const TITLE_BOOST = 2;

const SEPARATORS = new Set(["/", ":", "-", "_", " ", ".", "\\"]);

function fieldBonus(text: string): number[] {
  const out = new Array<number>(text.length).fill(0);
  for (let j = 0; j < text.length; j++) {
    if (j === 0) {
      out[j] = SCORE_START;
      continue;
    }
    const prev = text[j - 1];
    const curr = text[j];
    if (SEPARATORS.has(prev)) {
      out[j] = SCORE_SEPARATOR;
    } else if (
      prev >= "a" && prev <= "z" && curr >= "A" && curr <= "Z"
    ) {
      out[j] = SCORE_CAMEL;
    } else {
      out[j] = 0;
    }
  }
  return out;
}

// Fzy-style subsequence scorer. Returns null when `patternLower` is not a
// subsequence of `textLower`. Higher is better: consecutive runs, word
// boundaries and early positions score more; skipped chars between matches
// are penalized. `text` is the original-cased field (for camel-boundary
// detection); `textLower` is its lowercase form for comparison.
export function fuzzyScore(
  patternLower: string,
  text: string,
  textLower: string,
): number | null {
  const m = patternLower.length;
  const n = text.length;
  if (m === 0) return 0;
  if (n === 0 || m > n) return null;

  // Fast subsequence pre-check.
  let qi = 0;
  for (let ti = 0; ti < n && qi < m; ti++) {
    if (textLower[ti] === patternLower[qi]) qi++;
  }
  if (qi < m) return null;

  const bonus = fieldBonus(text);
  const NEG = Number.NEGATIVE_INFINITY;
  let dPrev = new Array<number>(n).fill(NEG);
  let mPrev = new Array<number>(n).fill(NEG);

  for (let j = 0; j < n; j++) {
    if (textLower[j] === patternLower[0]) {
      dPrev[j] = SCORE_BASE + bonus[j] - j * LEADING_PENALTY_PER_CHAR;
    }
    mPrev[j] = dPrev[j];
    if (j > 0 && mPrev[j - 1] > mPrev[j]) mPrev[j] = mPrev[j - 1];
  }

  for (let i = 1; i < m; i++) {
    const dCur = new Array<number>(n).fill(NEG);
    const mCur = new Array<number>(n).fill(NEG);
    const pc = patternLower[i];
    for (let j = 0; j < n; j++) {
      if (textLower[j] === pc) {
        const prevBest = j > 0 ? mPrev[j - 1] : NEG;
        const prevConsec = j > 0 ? dPrev[j - 1] : NEG;
        const scoreSplit = prevBest === NEG
          ? NEG
          : prevBest + SCORE_BASE + bonus[j];
        const scoreConsec = prevConsec === NEG
          ? NEG
          : prevConsec + SCORE_BASE + SCORE_CONSECUTIVE;
        dCur[j] = Math.max(scoreSplit, scoreConsec);
      }
      const carry = j > 0 ? mCur[j - 1] + GAP_INNER : NEG;
      mCur[j] = Math.max(carry, dCur[j]);
    }
    dPrev = dCur;
    mPrev = mCur;
  }

  // Best score ending at any position: trailing text after the last match
  // is not penalized.
  let best = NEG;
  for (let j = 0; j < n; j++) {
    if (dPrev[j] > best) best = dPrev[j];
  }
  return best === NEG ? null : best;
}
