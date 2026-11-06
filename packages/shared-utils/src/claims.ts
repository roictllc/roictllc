/**
 * Claims linter (spec §0.4, Product 11 tests): blocks promises the platform must never make.
 * Used on ROI's own copy (CI test over all public pages/seed text) and on generated sites/social captions.
 */
const BANNED: Array<[RegExp, string]> = [
  [/\bguarantee[sd]?\b(?![^.]*\bnot\b)/i, 'No guarantees of results, rankings or mentions.'],
  [/\b#?1 (on|in) google\b/i, 'No ranking promises.'],
  [/\bfirst page (of|on) google\b/i, 'No ranking promises.'],
  [/\b100% unique\b/i, 'Use "similarity-screened", never "100% unique".'],
  [/\btrademark[- ]cleared\b/i, 'Never claim trademark clearance.'],
  [/\bscreenshot[- ]proof\b/i, 'Screenshots cannot be blocked; do not claim otherwise.'],
  [/\bcure[sd]?\b/i, 'No medical claims.'],
  [/\brisk[- ]free (investment|returns?)\b/i, 'No financial guarantees.'],
];

export interface ClaimViolation {
  match: string;
  rule: string;
  index: number;
}

export function lintClaims(text: string): ClaimViolation[] {
  const out: ClaimViolation[] = [];
  for (const [re, rule] of BANNED) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) {
      // allow explicit negations such as "no guaranteed rankings" / "never guaranteed"
      const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index).toLowerCase();
      if (/\b(no|never|not|cannot|can't|without|nobody)\b[^.]*$/.test(before)) continue;
      out.push({ match: m[0], rule, index: m.index ?? 0 });
    }
  }
  return out;
}
