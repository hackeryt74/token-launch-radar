# Token Radar: how this board is built

A token launch radar, not a TVL table. It answers one question: which pre-token protocol is
worth farming next, and what do I do about it. The snapshot is DefiLlama's protocol index as of
2026-11-14, frozen: 758 protocols at or above $5,000,000 of TVL. Nothing here is live data and
nothing is a prediction of whether or when a token is issued.

## Who gets ranked

The board ranks 197 protocols. Every one of them records no token (no market cap, no CoinGecko
id, no symbol) and passes the watchlist's own test: not an exchange, not a versioned pool, and
not a wrapped, staked or bridged product of a token that already trades. The watchlist's 40
protocols are the floor — every protocol with at least $50,000,000 of TVL that passes the test —
and the early radar adds 157 more that pass the same test, above and below the floor. A wrapped
bitcoin, a bridged dollar or a staked ether never ranks as a launch that has not happened yet.

"Records no token" is what the snapshot says. It is not proof a protocol has none, and it is no
promise one is coming. The 40 live-token protocols the board sets aside are shown on their own
tab, with their market caps: the market's own values, never a model's.

## The value model (radar-2)

Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd x category_multiple
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

The category multiple is the median market-cap-to-TVL ratio of the tokenized protocols in the
same category, read from this same snapshot — three or more comparables, otherwise the global
median across all tokenized protocols (0.2138x). The multiples in use:

| Category | Multiple | Comparables |
| --- | --- | --- |
| Basis Trading | 0.6544x | 7 |
| Dexs | 0.3424x | 11 |
| RWA | 0.2748x | 9 |
| Yield | 0.1914x | 9 |
| CDP | 0.1687x | 3 |
| Yield Aggregator | 0.1510x | 4 |
| Indexes | 0.1477x | 3 |
| Lending | 0.1324x | 15 |

Every other category uses the global median of 0.2138x. A multiple is clamped to 0.02x–1.50x.
Age is the days since DefiLlama first listed the protocol — how long it has run with no token;
a missing listing date scores 365 days. No protocol name is special-cased: one function scores
every row, and the page recomputes every row from the same figures, so the page and the board
are the same arithmetic.

Worked example, rank 1 — Steakhouse Financial (Risk Curators, watchlist): TVL $2,753,981,495
x 0.2138 (global median; Risk Curators has one tokenized comparable, below the bar of three)
x 0.9890 (seven-day change -2.19%) x 0.7984 (543 days listed) = $464,924,662. The detail view
shows this arithmetic for every row.

## Farm plans

Each row carries six steps, derived from the protocol's own record — its category, its chains,
its TVL and its age — never from a hand-written list of names. The action follows the category
(a vault deposit, a liquidity position, a margin deposit, a stake), the capital follows the TVL
($250 above $5B, $150 above $1B, $100 above $100M, $50 below), the hold follows the age (60 days
under six months, 45 under a year, 30 after), and the gas follows the chain. Every step states
what it costs and how long it takes. The page generates the same plan from the same rules, so
the plan on screen is the plan in the board.

## How to read it

Rank is the model's claim, strongest implied value first. Sort by TVL, seven-day growth or age
to read the board another way; filter by category or chain; search by name. Select any row for
its model breakdown and its farm plan. Implied values are estimates, not prices.
