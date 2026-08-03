# Team Planner — Design Plan (Team Builder replacement)

Status: **Planning only — nothing built yet.**
Prepared for: Zach / FBP Commissioner's Office
Scope: New page for fbp-hub, named **Team Planner**, plus one small new fbp-trade-bot endpoint for cross-device plan saving (§3.4) — everything else reads already-synced data.

## 1. The ask, restated

This is a **whole-team, next-season planning tool** — the direct successor to Team Builder, not a multi-team trade-proposal tool. Combining the commissioner's original feedback with Zach's follow-up correction:

1. **Same job as Team Builder.** Pick one team, see its real current keepers + farm system, toggle IL Tag/RaT, and see the resulting $ spend and draft-pick tax exposure for next season.
2. **The one thing that has to change: "Add Player" (and "Add Pick") must be real, not fabricated.** Team Builder's add-player modal today is a blank text field plus a contract-tier dropdown — you type a name and pick a tier, and the tool just trusts it. The new tool needs to search the league's actual player pool — any player, on any team, regardless of who currently owns them — and pull in their real contract, so "what if I added [real player]" gives a real answer instead of a guess. Same for draft picks: add a real pick from the real draft-pick inventory, not a placeholder.
3. **A $ figure and pick-surrender estimate for whatever you build**, exactly like Team Builder's existing tax-bracket badge, just driven by real added/removed players instead of only your actual roster.
4. **Same idea for PAD** — build a target prospect list (including prospects you don't yet own) and see whether the team can afford it against its PAD balance.
5. **Side benefit, not the core mechanism:** because you can drop in any real player, this doubles as a trade-evaluation tool ("if I acquired this player, what does my cap sheet look like") without needing a formal two-sided trade-proposal UI.

Zach's direction stands: build this as a **new page**, not a rewrite of `team-builder.html` in place. Team Builder is retired once the new page is validated.

## 2. What already exists (so we don't rebuild it)

Four tools on the site touch overlapping pieces of this puzzle, and none of them do the full job:

| Page | What it actually does today | Why it's not this tool |
|---|---|---|
| **Team Builder** (`team-builder.html`/`js/team-builder.js`) | No login required; a dropdown lets you view *any one* of the 12 teams' keeper + prospect books, toggle IL/RaT, and see KAP $ spend, PAD $ spend, and a tax-bracket lookup, projected 4 seasons out. Pure client-side scratchpad (localStorage only, nothing submitted). | **Its "Add Player" is a fake entry, not a real one** — a blank name field plus a manually-picked contract tier, with no connection to the real player pool. You can't actually model "what if I added [real player X]." It also has no draft picks or WizBucks in its data model at all, and its own copy of the cost tables has already drifted slightly from the KAP page's copy. |
| **Trade page** (`trade.html`/`js/trade.js`) | The real, backend-integrated trade proposal tool. Hard login-gated (your team is locked as Team 1; Team 2/3 are free picks). Has genuinely good cross-team **Player picker**, **Pick picker**, and **WizBucks picker** modals backed by live data. Submits to Discord-approval workflow. | Shows **zero dollar totals or tax math anywhere** — it's a "who gives what to whom" builder, not a calculator. Pick-picker UI is currently hidden via CSS for this season (logic still intact underneath). |
| **KAP page** (`kap.html`/`js/kap.js`) | The authoritative, real-money wizard for keeper contracting: has the correct taxable-spend formula, tax-bracket table, IL Tag/RaT logic, and a picks preview. Hard login-gated to your own team only. | It's a live transactional submission flow, not a sandbox — running numbers here means actually spending real WB. Also only ever sees your own roster. |
| **PAD page** (`pad.html`/`js/pad.js`) | Real wizard for prospect contracts + DC/BC slot purchases, with a working "spend vs. available balance" affordability check. Hard login-gated to your own team. | Only lets you contract prospects you already own — there's no board of not-yet-owned/"projected" prospects to plan against, which is exactly what the commissioner asked for. |

**Net finding: no tool today combines Team Builder's real $/tax math with a real, league-wide way to add players you don't already own** (confirmed independently against both the frontend and the fbp-trade-bot backend — nothing anywhere does a live cross-league player/pick search feeding into a cost calculator). That combination is the genuinely new piece of functionality.

The good news: most of this can be built as a **read-only, client-side page**, the same way Team Builder and Trade already work. `combined_players.json`, `draft_order_2026.json`, `wizbucks.json`, and `config/managers.json` are already synced into fbp-hub every 15 minutes. The one exception is cross-device plan saving (§3.4), which needs one small new backend endpoint — everything else in this plan is a read.

## 3. Recommended design

### 3.1 One new page, two modes

A single page — **Team Planner** (file `team-planner.html`, nav label "Team Planner") — with a mode toggle at the top:

- **Keeper / KAP Mode** — the $ + pick-surrender calculator described in ask #2.
- **PAD Mode** — the prospect/slot affordability calculator described in ask #2's second half.

These share a visual shell but are functionally separate calculators, because the two currencies (KAP taxable spend vs. PAD balance) and the two "asset" vocabularies (keeper contracts + keeper-draft picks vs. prospect contracts + prospect-draft slots) don't overlap.

### 3.2 No login wall

Matches Team Builder's existing (looser) pattern rather than KAP/PAD/Trade's hard gate. Anyone — commissioner included — can open the page and start building scenarios with zero friction. If a manager happens to be logged in, we can quietly pre-select their team as a convenience default (as Team Builder already does), but it's never required.

### 3.3 One team at a time — but "Add Player"/"Add Pick" search the real, whole league

This is **not** a multi-team trade-comparison tool. It's Team Builder's exact model — select one team, see and edit its full plan for next season — with one core fix:

- You select **one team** to plan for (any of the 12; if logged in, defaults to your own — exactly like Team Builder does today).
- The plan is seeded from that team's **real current keepers + real current farm system** (same as Team Builder's `loadTeam()` today), fully editable: drop any real player from the plan, or add one.
- **"Add Player" opens a real, league-wide search** — ported from Trade page's Player Picker modal — across the entire actual player pool (`FBPHub.data.players`), regardless of who currently owns them. Selecting a real player pulls in their real contract tier, not a manually-typed guess. This is the single biggest functional fix over Team Builder and directly answers "it needs to be open to add in any player."
- **"Add Pick" works the same way** against the real draft-pick inventory (`data/draft_order_2026.json`) — pull in any real pick from any team, not a placeholder.
- **"Add WizBucks"** lets you add or subtract a hypothetical WB amount (e.g., modeling sending/receiving cash as part of an acquisition).
- **Manipulation tools (IL Tag, RaT)** toggle per player exactly as Team Builder does today — usable on any player in the plan, whether they were already on the roster or just added.
- The $ total and tax-bracket/pick-surrender estimate recompute live off this one team's whole resulting roster, exactly like Team Builder's existing budget engine — just fed by real additions/removals instead of fabricated ones. There's no second "side" and no multi-team comparison view; evaluating a trade just means adding the player(s) you'd receive and dropping the player(s)/picks you'd give up, then reading the resulting cap sheet for your own team.

### 3.4 Save Plan — cross-device persistence

A **"Save Plan" button appears at both the top and bottom of the page** and does the same thing wherever it's clicked. Because the plan needs to show up the same way whether you open the page on desktop or mobile, it can't be `localStorage`-only the way Team Builder is today — that only persists on one browser, on one device. This is the one piece of this whole plan that genuinely needs a small new backend addition:

- **New data file**, `data/team_planner_plans.json`, roughly `{ "<TEAM_ABBR>": { "kap": { ...plan state, saved_at }, "pad": { ...plan state, saved_at } } }` — one active saved plan per team per mode, overwritten on each save. Not a library of multiple named plans for v1 — "lock in the plan" reads as one current plan per team, which is also the simplest thing to build.
- **New endpoints**, following the exact same pattern every other write in fbp-trade-bot already uses (JSON file + git commit *is* the persistence layer — see `API_TRANSACTION_RULES.md`'s "Rule 0"):
  - `POST /api/team-planner/save` — body: `team`, `mode` (`kap`/`pad`), and the plan state.
  - `GET /api/team-planner/{team}` — returns whatever's saved for that team (both modes), so the page auto-loads the right one the instant a team is selected, on any device.
- **Save references, not frozen dollar amounts.** The saved payload should be upids of added/dropped players, pick identifiers, IL Tag/RaT selections, WB adjustment, DC/BC slot counts, and added-prospect upids — not a frozen cost snapshot. Costs recalculate live against current `combined_players.json`/`draft_order_2026.json` every time the plan loads, so a saved plan never goes stale even as real league data changes underneath it.
- **Keep the local safety net too.** Continue auto-saving every edit to `localStorage` on that device (as Team Builder already does), so an accidental tab close before hitting "Save Plan" doesn't lose in-progress work. "Save Plan" is the deliberate action that pushes the current state to the server for cross-device access; the `localStorage` copy is just an unsaved-draft safety net.
- **One real judgment call**: should saving require being logged in as that team (protects against someone else overwriting your saved plan), or stay fully open like the rest of this tool's "no login wall" design? Recommendation: keep it open for v1 — consistent with everything else here, and low-stakes since this is a non-binding sandbox — but flagging it since it's the one spot in this tool where someone's saved work could get overwritten by someone else. See open question in §10.

### 3.5 PAD mode needs one genuinely new thing: a prospect board

PAD mode reuses PAD's existing affordability-check pattern (running total vs. available balance), but today's PAD page can only ever add prospects a team **already owns**. To answer "can I afford my *projected* prospects," the planner needs a searchable board of not-yet-owned prospects to hypothetically add. `data/top100_prospects.json` and `data/prospect_tags.json` (which already flags FYPD-pool eligibility) are the right source — neither is currently wired into any PAD tooling, so this board is new UI, not a port.

Also note for anyone building this later: PAD's "picks" are **not** the same object as KAP's draft picks. PAD spends on **DC Slots ($5 each, max 15)** and **BC Slots ($20 each, max 2)** — binary eligibility unlocks for the Prospect Draft — not tradeable round/pick-number assets. Don't conflate the two "pick" concepts across modes.

## 4. Domain rules reference (so the build doesn't have to re-derive these)

**Keeper contract costs** (`KEEPER_SALARIES` — identical in `kap.js` and the backend's `kap_processor.py`, so this table is trustworthy as-is):

| Tier | Cost | Tier | Cost | Tier | Cost |
|---|---|---|---|---|---|
| TC-R | $5 | VC-1 | $35 | FC-1 | $85 |
| TC-BC-1 | $5 | VC-2 | $55 | FC-2 / FC-2+ | $125 |
| TC-BC-2 | $5 | TC-1 | $15 | TC-2 | $25 |

**Salary manipulation tools** (Constitution Article 2 §3 — this is the exact phrase "manipulation tools" comes from, and IL Tag/RaT are the *only* two):

- **IL Tag** — free (no WB cost), reduces cost by tier (TC −$10, VC −$15, FC −$35), one per contract-type per team, not usable on TC-R/TC-BC.
- **Reduce a Tier (RaT)** — flat $75, tax-free (excluded from taxable spend, but does count against total WB spent), drops a player one tier (FC→VC-2, VC-2→VC-1; cannot be used on or reduce into a TC tier), stackable, KAP-only.

**KAP draft-pick tax brackets** (taxable spend = keeper salary cost after IL/RaT + RD1-3 buy-in cost):

| Taxable spend | Rounds surrendered |
|---|---|
| ≤ $325 | None |
| $326–350 | 8, 9, 10 |
| $351–375 | 7, 8, 9 |
| $376–400 | 6, 7, 8 |
| $401–420 | 5, 6, 7 |
| $421–435 | 4, 5, 6, 7, 8 |
| > $435 | Not supposed to be allowed (see §6.2 — the live backend has a bug here; the planner should not copy it) |

**Draft-pick buy-ins** (gate keeping/trading your own pick in that round): RD1 $55, RD2 $35, RD3 $10.

**PAD prospect contract costs**: DC $5, PC $10, BC $20 (2026 rule: every team's first non-legacy BC is free). **PAD slot costs**: DC Slot $5 (max 15), BC Slot $20 (max 2, unlocks FYPD rounds 1–2).

**Rollover caps**: PAD→KAP max $30, KAP→APA max $100 (the live KAP page UI applies this $100 cap; the backend's own rollover computation does not appear to — flagged in §6.3, plan for the constitution's stated cap).

## 5. Data sources (all already available, all read-only)

| Data | Source | Notes |
|---|---|---|
| Players & prospects, contract tiers, ownership | `FBPHub.data.players` (`data/combined_players.json`) | Reuse the shared cache the way `trade.js` does — don't re-fetch like `team-builder.js` does. |
| WB balances | `FBPHub.data.wizbucks` (`data/wizbucks.json`) | Single wallet per team, keyed by full team name. This is the site-wide "source of truth" rule (see `CRITICAL_RULES.md`) — never read balances from `config/managers.json`. |
| Team names, finish bracket, allotment record | `config/managers.json` | Reference/display only for PAD's base allotment by bracket; not the balance source. |
| Draft picks (round, owner, traded, buy-in status) | `data/draft_order_2026.json` | Powers the cross-team pick picker (same file Trade page's hidden pick-picker already reads). |
| PAD prospect board (net-new) | `data/top100_prospects.json`, `data/prospect_tags.json` | Neither is wired into any PAD tooling today; net-new usage. |
| Saved plans (new) | `POST /api/team-planner/save`, `GET /api/team-planner/{team}` (new fbp-trade-bot endpoints) | The only write path this tool needs — see §3.4. |

Everything above is a read against data already synced into fbp-hub, except one small new write path for saving plans (§3.4).

## 6. Things worth flagging to the commissioner before/while building

These are real gaps or inconsistencies the research turned up in the *existing* system. None of them block building the planner, but the planner's math will follow the constitution's intended rules rather than quietly copying these bugs, so it's worth the commissioner knowing where the two might disagree:

1. **RaT may not be mechanically enforced server-side.** The backend charges the $75 fee but — as far as this audit could tell — never actually persists the tier downgrade onto the player's record. The planner will model RaT the way the constitution describes it (reduced tier + $75 charge); real KAP submissions may currently only be doing the charge.
2. **Taxable spend over $435 isn't actually blocked today** — the backend's bracket lookup silently falls through to "no tax" for any value outside all listed ranges. The planner will treat over-$435 as a hard flag rather than mimic this.
3. **KAP→APA rollover cap ($100) may not be enforced on the backend** even though the KAP page's UI caps the displayed number. Worth a real confirmation from whoever maintains fbp-trade-bot.
4. **Pick trading is currently capped at rounds 1–15 in the trade API**, even though the real keeper draft runs 29 rounds, and draft-pick UI is feature-flagged off in Trade page for this season. The plan assumes the planner can still *model* rounds 16–29 informationally even though they can't be formally traded through Trade page yet — worth confirming that's desired.
5. **WizBucks wallet balance may lag right after a PAD submission** — there's a plausible write-order issue where PAD's own save could overwrite the ledger's correct post-spend balance. The planner should show balances as "as of last data sync" rather than imply real-time accuracy.
6. **Contract-type classification already disagrees at the edges** between Team Builder and Trade page (different fallback tiers for ambiguous `contract_type` strings). The planner gets a fresh, single implementation rather than inheriting either.

## 7. Navigation integration (confirmed from the live site)

Team Builder is currently wired into the site in four separate places. Team Planner needs to land in all four, consistently, or it'll feel bolted-on:

1. **The static "Front Office" dropdown** — duplicated in the `<nav class="mobile-nav">` markup on every page (confirmed present in all ~22 HTML files, e.g. `index.html:64-97`). Team Builder's entry sits between Auction and WizBucks:
   ```html
   <a href="team-builder.html" class="nav-dropdown-item">
       <i class="fas fa-drafting-compass"></i>
       <span>Team Builder</span>
   </a>
   ```
   Swap to `team-planner.html` / "Team Planner" — same icon, same position, in all ~22 files.

2. **Dashboard quick actions** — `js/dashboard-tabs.js:615`, one file, not duplicated. Its actions-array builder unconditionally pushes `{ href: 'team-builder.html', icon: 'fa-drafting-compass', label: 'Team Builder' }` (right after PAD/KAP, before "Purchase Contracts"). Swap the same way.

3. **Nav active-state highlighting** — `js/main.js:379`, `highlightActivePage()`'s `frontOfficePages` array is what makes the "Front Office" nav button visually light up when you're on one of its pages. It lists `'team-builder.html'` — swap for `'team-planner.html'` or the nav button stops highlighting once the old page is gone.

4. **The "team dropdown" — the personalized menu that appears after login.** This is the one you mean, and it's built entirely in one place: `js/auth.js`'s `addUserMenu()` (~line 480), which renders Dashboard → My Roster → Trade Portal → Draft Board → PAD → KAP → [Admin] → Settings → Logout. **Team Builder was never in this menu** — adding Team Planner here is new, not a swap. Recommend inserting it right after "My Roster":
   ```html
   <a href="team-planner.html?team=${team?.abbreviation || ''}">
       <i class="fas fa-drafting-compass"></i>
       Team Planner
   </a>
   ```
   The `?team=` param matters specifically here: PAD/KAP don't need it because they're hard login-gated and read the team straight from the session, but Team Planner has no login wall by design (§3.2), so it needs the URL param to know which team to default to when someone opens it from their own personalized menu — the exact same reason `rosters.html?team=${abbr}` ("My Roster") already does it.

Using the same icon (`fa-drafting-compass`, inherited from Team Builder) in all four spots is what makes this read as one consistent feature rather than four different-looking links to the same page.

## 8. Build scope — file checklist

**fbp-hub (new files):**
- `team-planner.html` — follows the existing per-page pattern: same nav markup as every other page, own `<link>` to `css/team-planner.css`, loads `js/main.js` then `js/team-planner.js`.
- `js/team-planner.js` — new controller, `initTeamPlannerPage()` registered in `main.js`'s `initializePage()` switch (the documented pattern for adding a page — see `WARP.md`). Reads `?team=` from the URL. Ports, rather than reinvents: real roster loading (`team-builder.js`'s `loadTeam()` logic, but sourced from the shared `FBPHub.data.players` cache instead of a redundant fetch — fixes the pattern inconsistency noted in §2); real cross-league player/pick search (`trade.js`'s `showPlayerPicker`/`showPickPicker` and their `confirm*` handlers, generalized to add into a roster plan instead of a two-team transfer); the $/tax engine (`team-builder.js`'s `CONTRACT_DATA`/`effectiveCost`/`getKAPTaxBrackets`, rekeyed to the hyphenated tier format — `TC-1` not `TC 1` — that `kap.js` and the backend actually use, closing the classification drift noted in §6); PAD affordability (`pad.js`'s `calculateTotalSpend` pattern) plus the new prospect board (§3.5); Save Plan (calls the two new endpoints below).
- `css/team-planner.css` — new stylesheet following `team-builder.css`'s existing variables and contract-badge conventions (§4) so it looks native, not bolted on.

**fbp-hub (edits):**
- All ~22 HTML pages — nav integration #1 above.
- `js/dashboard-tabs.js` — #2.
- `js/main.js` — #3, plus registering `team-planner` in the `initializePage()` page-name switch.
- `js/auth.js` — #4 (net new entry, not a swap).

**fbp-trade-bot (new, only for Save Plan — §3.4):**
- `data/team_planner_plans.json` — new data file.
- A new small router module, following the existing `api_buyin.py`/`api_trade.py` pattern: `POST /api/team-planner/save`, `GET /api/team-planner/{team}`.
- Register it in `health.py` alongside the other `api_*.py` includes.
- Front it through the Cloudflare Worker (`docs/cloudflare_worker/worker.js`) the same way other read/write endpoints are — plain `proxyToBot` (API-key only, no manager auth) is enough given §3.4's recommendation to keep saving open.

**Not this pass:** leave `team-builder.html`/`.js`/`.css` in place but fully unlinked once the four nav touchpoints are switched over — don't delete until Team Planner's had a short validation window (§9).

## 9. Suggested build sequencing

1. Build `team-planner.html`/`.js`/`.css` — Keeper/KAP mode only.
2. Wire nav touchpoints 1–3 from §7 so the page is actually reachable.
3. Add PAD mode.
4. Build the small backend save/load endpoint (§8), then wire nav touchpoint 4 — worth sequencing last since a personalized "your team's plan" shortcut isn't meaningfully different from the generic link until Save Plan actually works end to end.
5. Validate with a few managers, then retire Team Builder (unlink fully; delete later once nobody's opened it in a while).

## 10. Open questions for Zach / the commissioner

- Keep Team Builder's multi-season (2026–2029) projection tabs, or focus this tool on next season only, matching "planning your whole team for next year" literally?
- Should rounds 16–29 be addable as real picks even though Trade page can't formally move them this season (per §6.4)?
- Should the real player/pick search exclude anything (e.g., players already locked to another team's protected keeper status), or should literally anyone in the pool be addable to the plan since it's a non-binding hypothetical either way?
- Should **saving** a plan require being logged in as that team, or stay fully open like the rest of the tool (§3.4)? Recommendation is to keep it open, but flagging since it's the one place someone's saved work could get overwritten by someone else.
