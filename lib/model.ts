// Token Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the snapshot records that is not an exchange, not a
// versioned pool, and not a wrapped, staked or bridged product of a token that already trades. The
// watchlist's 40 are the floor; the radar adds every other protocol that passes the same test, above
// and below the floor, because the field guide says a protocol the watchlist leaves out is no worse
// a subject than one on it. The test is the watchlist's own: its excluded categories, its version
// rule, and its wrapped, staked and exchange-name rules — so a wrapped bitcoin, a bridged dollar or
// a staked ether never ranks as a launch that has not happened yet.
//
// Implied value follows only from the snapshot's own figures. The base multiple is not a constant:
// for each category it is the median market-cap-to-TVL ratio of the tokenized protocols in that same
// category in this same snapshot (three or more comparables, else the global median across every
// tokenized protocol). A DEX's token trades at a different multiple of its TVL than a lending
// protocol's, and the snapshot itself says what each multiple is. Then:
//
//   implied = tvl_usd x category_multiple
//           x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
//           x (0.6 + min(age_days, 1095) / 1095 x 0.4)
//
// Age is the days since DefiLlama first listed the protocol: how long it has run with no token. A
// protocol whose listing date is missing is scored at 365 days. No protocol name is ever
// special-cased: the same function scores every row, and the dashboard recomputes every row from the
// same figures, so the page and the board are visibly the same arithmetic.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comparables: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comparables: 3,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  board_source: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** One compact dashboard row, as an array in field order (see ROW_FIELDS). The base multiple is
 * stored at full precision, and the growth and maturity multipliers are recomputed in the page
 * from change_7d and age_days, so the page's recomputation of the implied value is exact. */
export type RadarRowArray = [
  rank: number,
  slug: string,
  name: string,
  category: string | null,
  chains: string,
  tvl_usd: number,
  change_7d: number | null,
  age_days: number | null,
  implied_value_usd: number,
  base_multiple: number,
  board_source: 'watchlist' | 'early',
];

/** The field order of a compact dashboard row. */
export const ROW_FIELDS = [
  'rank',
  'slug',
  'name',
  'category',
  'chains',
  'tvl_usd',
  'change_7d',
  'age_days',
  'implied_value_usd',
  'base_multiple',
  'board_source',
] as const;

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  multiples: Record<string, { multiple: number; comparables: number }>;
  row_fields: readonly string[];
  rows: RadarRowArray[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted list, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The category multiples, derived from the snapshot's own tokenized protocols: for each category,
 * the median market-cap-to-TVL ratio of its protocols that record a token, when at least
 * `min_comparables` of them carry both figures; every other category falls back to the global
 * median across all tokenized protocols. Each multiple is clamped to the model's band.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; byCategory: Map<string, { multiple: number; comparables: number }> } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  all.sort((a, b) => a - b);
  const globalRaw = median(all) ?? 0.2;
  const global = Math.min(model.multiple_cap, Math.max(model.multiple_floor, globalRaw));
  const out = new Map<string, { multiple: number; comparables: number }>();
  for (const [category, ratios] of byCategory) {
    ratios.sort((a, b) => a - b);
    if (ratios.length < model.min_comparables) continue;
    const m = median(ratios);
    if (m === null) continue;
    out.set(category, {
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, m)),
      comparables: ratios.length,
    });
  }
  return { global, byCategory: out };
}

/** The multiple one protocol's category carries, and how many comparables set it. */
export function multipleFor(
  category: string | null,
  multiples: { global: number; byCategory: Map<string, { multiple: number; comparables: number }> },
): { multiple: number; comparables: number } {
  if (category !== null) {
    const hit = multiples.byCategory.get(category);
    if (hit !== undefined) return hit;
  }
  return { multiple: multiples.global, comparables: 0 };
}

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { global: number; byCategory: Map<string, { multiple: number; comparables: number }> },
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  comparables: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comparables } = multipleFor(protocol.category, multiples);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, comparables, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The exchange names whose products are not launches of their own. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word that marks a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The categories the watchlist's rule keeps out: a bridge moves a token that already trades, a
 * liquid-staking or restaked product is a token that already trades in another form, and an
 * exchange is not a protocol launch. Cross Chain Bridge is a bridge by the same reasoning.
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether a protocol is one the board may rank: pre-token, not an excluded category, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name)
  );
}

/** Whether a protocol's name marks it a product of a token that already trades. */
export function isNameExcluded(p: SnapshotProtocol): boolean {
  return EXCHANGE_PREFIX.test(p.name) || WRAPPED_WORD.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; multiples: { global: number; byCategory: Map<string, { multiple: number; comparables: number }> } } {
  const multiples = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries (it
  // cannot, but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol that passes the same test the watchlist's rule
  // applies — not an exchange, not a versioned pool, not a wrapped, staked or bridged product of a
  // token that already trades — at any TVL, above and below the floor.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isRankable(p) || isNameExcluded(p)) continue;
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    board_source: snapshot.watchlist.includes(s.p.slug) ? 'watchlist' : 'early',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(s.multiple),
      category_comparables: s.comparables,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
  return { board, multiples };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction usually costs on a chain, for the plan's cost lines. */
function gasNote(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $3 to $15 of gas on Ethereum, so batch your actions';
  if (c.includes('solana')) return 'under $0.10 of gas on Solana';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon'))
    return 'under $0.50 of gas on this chain';
  if (c.includes('bitcoin') || c.includes('hyperliquid')) return 'about $1 to $3 of gas';
  return 'about $1 to $3 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('chain') || c.includes('otc'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield aggregator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('yield') || c.includes('farm'))
    return `Deposit $${capital} into ${name}'s highest-TVL strategy on ${chain} and keep the position open.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment') || c.includes('card'))
    return `Spend $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('index') || c.includes('governance'))
    return `Buy $${capital} of the ${name} basket on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $2 of gas a week (${gas})`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio:
        p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for the dashboard's data file. The base multiple is the exact one
 * the board used, so the page recomputes the implied value to the dollar. */
export function radarRow(
  row: BoardRow,
  multiples: { global: number; byCategory: Map<string, { multiple: number; comparables: number }> },
): RadarRowArray {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category,
    row.chains.join(', '),
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    multipleFor(row.category, multiples).multiple,
    row.board_source,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const { board, multiples } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.board_source === 'early').length;
  const multiplesRecord: Record<string, { multiple: number; comparables: number }> = {};
  // The table names only the categories the board actually ranks: a multiple no row uses is
  // not shown, so the table and the board agree.
  const boardCategories = new Set(board.map((r) => r.category));
  for (const [category, v] of [...multiples.byCategory.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    if (!boardCategories.has(category)) continue;
    multiplesRecord[category] = { multiple: round4(v.multiple), comparables: v.comparables };
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    multiples: multiplesRecord,
    row_fields: ROW_FIELDS,
    rows: board.map((r) => radarRow(r, multiples)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains)
        ? p.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: p.tvl_usd,
      change_7d:
        typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd:
        typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++)
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
  if (
    board.length >= 2 &&
    board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd
  ) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps)
      if (s.trim().length < 20 || s.trim().length > 600)
        return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/**
 * The dashboard's whole dataset as one script, no fetch and no network. It is written one row per
 * line, so the dossier's text — which cuts at line boundaries — carries as many whole rows as its
 * cap holds, instead of one line too long to show at all.
 */
export function dataScript(radar: RadarData): string {
  const head = [
    '// Token Radar data: the ranked board as compact rows, in field order (see row_fields).',
    '// Rows: [rank, slug, name, category, chains, tvl_usd, change_7d, age_days, implied_value_usd,',
    '// base_multiple, board_source]. The base multiple is the exact one the board used; the growth and',
    '// maturity multipliers are recomputed in the page from change_7d and age_days, so the page\'s',
    '// recomputation of the implied value matches board.json to the dollar. Farm steps are generated in',
    '// the page by app.js from the same rules main.ts writes to board.json, so the page and the board',
    '// are the same plan. Live rows carry the market\'s own values, never a model\'s.',
  ].join('\n');
  const fields: string[] = [
    `"as_of": ${JSON.stringify(radar.as_of)}`,
    `"source": ${JSON.stringify(radar.source)}`,
    `"floor_usd": ${radar.floor_usd}`,
    `"model": ${JSON.stringify(radar.model)}`,
    `"model_version": ${JSON.stringify(radar.model_version)}`,
    `"watchlist_size": ${radar.watchlist_size}`,
    `"board_size": ${radar.board_size}`,
    `"early_size": ${radar.early_size}`,
    `"live_size": ${radar.live_size}`,
    `"global_multiple": ${radar.global_multiple}`,
    `"multiples": ${JSON.stringify(radar.multiples)}`,
    `"row_fields": ${JSON.stringify(radar.row_fields)}`,
  ];
  const rows = radar.rows.map((r) => JSON.stringify(r)).join(',\n');
  const live = radar.live.map((r) => JSON.stringify(r)).join(',\n');
  return (
    `${head}\nwindow.RADAR={\n${fields.join(',\n')},\n"rows": [\n${rows}\n],\n"live": [\n${live}\n]\n};\n`
  );
}
