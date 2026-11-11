# FairCart Agent Guard

**AI agents are starting to shop for us. Stores are built to trick shoppers, and an agent is easier to trick than a person.** It won't notice a protection plan that's already ticked, a fee that only appears at payment, ₹10 in the total that no line explains, or text on the page written to manipulate it.

FairCart Agent Guard is the safety layer that decides when a PayPal-powered shopping agent may pay.

> **The AI proposes. FairCart sees. Code decides. PayPal moves only the money you approved.**

In the demo, an AI agent buys 5 kg of atta from DemoMart, a practice store full of deliberate dark patterns. DemoMart tries to charge **₹471** for a **₹289** product. The agent unticks the protection plan, removes the pass it never chose, and disputes the ₹10 nobody explained. It asks you about the two fees it can't remove. PayPal then captures **₹313**: every line itemised, and every rupee either in your instructions or approved by you by name.

Built for the PayPal AI Hackathon (Devpost). MIT licensed.

## Try it

**Hosted demo:** _add the Render URL here_

1. Pick **DemoMart (tricky)** or **FairMart (honest)**.
2. Sign your instructions: the product, the most you'll spend, and the fees you accept.
3. Watch the agent shop on the left while the timeline on the right explains each step.
4. When the agent asks, approve the fees by name, or stop.
5. Pay with PayPal (sandbox). Sandbox buyer login: _add the sandbox personal account email here; share the password with judges privately_.

FairMart is the control: same product, no tricks. The checker passes it first time, which shows nothing about DemoMart is hard-coded.

## How it works

```
 Browser (your environment)                         Server (Node 22, Hono, one service)
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────────┐
│ Store iframe (DemoMart / FairMart)      │       │ FairCart side                                │
│   ▲ act by control id   │ live page     │       │  Run state, signed instructions, audit log   │
│ ┌─┴────────┐  ┌─────────▼────────────┐  │       │  Rule engine re-run on the journey           │
│ │ Driver   │  │ Sensor: FairCart's   │──obs──►  │  Planner: Gemini, one call per page          │
│ │          │  │ adapter → snapshot   │  │       │    (backup planner if the AI is unavailable) │
│ └──────────┘  └──────────────────────┘  │◄─plan─│  Checker → PASS + signed authorization       │
│ Console: instructions · timeline ·      │       │  Order check: PayPal order == authorization  │
│ findings · checker · PayPal · receipt   │◄────► ├─────────────────────────────────────────────┤
└─────────────────────────────────────────┘       │ DemoMart merchant side                       │
                                                  │  Orders v2 create · capture · webhook        │
                                                  └─────────────────────────────────────────────┘
```

### Trust model

| Role | What it is | Trusted to | Never |
|---|---|---|---|
| Planner | Gemini (or the labelled backup planner) | choose shopping actions for the current page | see raw HTML, approve money, change your instructions |
| Sensor | FairCart's adapter and rule engine (13 CCPA dark-pattern categories) | describe the page and flag patterns | decide |
| Checker | a pure function on the server | pass or block against your signed instructions | take input from the planner |
| Merchant | DemoMart's checkout | create and capture its PayPal order | be trusted without checking |

- **Only you can widen your instructions.** The agent can ask; it can't approve. Approvals match exact labels and amounts the checker raised.
- **An unexplained amount can never be approved.** The agent questions it through the store's bill help, or the run stops.
- **Page text is data.** DemoMart's product description tells AI assistants the protection plan is "mandatory". The planner only sees a structured page brief, with page text marked untrusted. And even if a model believed it, the checker blocks the ₹49.
- **Money is integer paise and cents**, never floats. PayPal amounts are converted per line at a fixed, displayed demo rate (₹88 = US$1), so the order always reconciles.

### PayPal

- **DemoMart is the merchant of record.** FairCart never receives money.
- The checker's PASS produces an **HMAC-signed, single-use authorization** (30 minutes to create the order). DemoMart's agent-checkout endpoint verifies it and creates an **Orders v2** order with every line as an item (`PayPal-Request-Id` = authorization id, so retries are idempotent).
- **FairCart then reads the PayPal order back** and compares every item, amount and the currency with the authorization before the buyer can approve. A mismatch stops the run.
- After the buyer approves (JS SDK buttons), DemoMart captures, the captured amount is checked again, and a **verified `PAYMENT.CAPTURE.COMPLETED` webhook** marks the run settled.
- FairCart is designed to sit in front of agents built on PayPal's tools, including the PayPal Agent Toolkit. This demo calls the Orders v2 REST API directly from code, because the guard needs exact cents, per-order idempotency and `invoice_id`.

### AI

- **Gemini** (`gemini-3.5-flash-lite` by default; set `LLM_MODEL` to change it) plans one page at a time through a single forced function call, `submit_plan`. Every action is validated: it must use a tool from a fixed list and a control id that exists on the page.
- If Gemini is unavailable (rate limits, overload, timeouts), a deterministic **backup planner (no AI)** finishes the run from FairCart's reading of the page. The UI labels it clearly. It knows nothing about DemoMart: it unticks paid add-ons, declines pop-ups, removes what wasn't asked for, and questions unexplained amounts.

## Run it locally

Requirements: Node 22 or newer.

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` (all optional for a first look):

| Variable | Meaning |
|---|---|
| `AUTHZ_HMAC_SECRET` | any long random string (signs payment authorizations) |
| `PAYPAL_MODE` | `mock` (default, no PayPal calls; approval is simulated and labelled) or `sandbox` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | from a PayPal developer sandbox app |
| `PAYPAL_WEBHOOK_ID` | the webhook you add for `https://<host>/api/paypal/webhook` |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | `gemini` plus a Google AI Studio key; without a key the backup planner runs |

```bash
npm run dev:agent
```

Open http://localhost:5173. The API runs on port 8787 behind the Vite proxy.

```bash
npm test
```

```bash
npm run typecheck
```

Production (what Render runs): `npm run build:web` then `npm start`. One Node service serves the console, the stores and the API. `render.yaml` is the blueprint.

## Honest limits

- The server trusts the browser's **reading of the page**, just as a careful human trusts what they see. It does not trust the browser's findings, verdicts, amounts or instructions: it re-runs the rule engine, re-adds the bill, owns your instructions, and checks the PayPal order itself.
- In this demo, FairCart reads the PayPal order with the same sandbox app the store uses, standing in for the order details PayPal shows the payer.
- Runs live in server memory for 30 minutes. A restart ends them, and the console offers a new run.
- The stores are fictional practice stores. Real retailers are out of scope for the agent; the browser extension below reads them for people.

## Repository

| Path | What |
|---|---|
| `packages/guard` | instructions (mandate), checker rules, signed authorization, PayPal order comparison. Pure, fully tested |
| `packages/agent-core` | planner tools, page brief, prompt, plan validation, backup planner |
| `packages/money` | paise, cents, the demo exchange rate |
| `packages/adapters` | the extension's page adapters, re-exported in place |
| `packages/rules`, `schemas`, `taxonomy`, `rulepacks/` | FairCart's rule engine and the 13 CCPA dark-pattern categories |
| `apps/server` | runs API, DemoMart merchant API, PayPal client, Gemini provider |
| `apps/web` | the run console and the store pages |
| `apps/shop` | DemoMart and FairMart |
| `apps/extension` | the FairCart Chrome extension, where this started |

---

# The FairCart browser extension

FairCart is a consumer-protection browser extension for Indian online shopping. It reads the shopping page you are already on, flags interface patterns that India's CCPA *Guidelines for Prevention and Regulation of Dark Patterns, 2023* describe, explains what it saw and why that can matter, and records the prices you see so it can tell a real deal from a dressed-up one.

This repository is the **Chrome extension proof of concept**. The Android app, the backend and AI interpretation come later; see [docs/architecture.html](docs/architecture.html).

### What works in this build

| Area | Status |
|---|---|
| Rule engine, all 13 CCPA categories | Works. 14 rules, data-driven (`rulepacks/core.v1.json`), with a positive and negative fixture per category |
| 15 additional sub-patterns from the research report | Modelled as tags that map onto official categories (`packages/taxonomy`) |
| Amazon India adapter | Works on search, product and cart pages. Selectors checked against live amazon.in on 2026-10-24 |
| Flipkart adapter | Works on search and product pages, built mainly on Flipkart's own JSON-LD. Checked live on 2026-10-24 |
| Other retailers (Myntra, Nykaa, Meesho, AJIO, JioMart, Tata Neu, Blinkit, Zepto, Swiggy Instamart, BigBasket) | Generic reader only: JSON-LD/Open Graph product data, bill reader, cues. Labelled **Limited** in the UI |
| Flipkart Minutes, Amazon Now | Not supported. App-only, so a browser extension can't read them |
| Journey comparison (listing → product → cart → checkout) | Works, per tab, for the browser session |
| Checkout scanner | Works on any enabled site with a readable bill. Read-only |
| Price history and the 30-day low | Works from observations on this device. A 30-day low is shown only with 30+ days of coverage and no gap over 3 days |
| Cross-store comparison | User-mediated: products you open at different stores are matched (exact / same model / variant differs / substitute) and ranked by effective total. Unknown delivery is never counted as ₹0 |
| Price alerts | Fire when FairCart sees the product at or below your target on a page you open. No background fetching |
| Cursor companion, hover actions, inline markers, side panel, onboarding, settings | Built. Visual QA in a real Chrome profile is still to do (see below) |
| Shared price history, affiliate APIs, AI interpretation | Not in this build. The side panel lists each as unavailable or not configured |

### Install and run

Requirements: Node 22 or newer, and Chrome 116 or newer (needed for the side panel API).

```bash
npm install
```

```bash
npm run build
```

Then load it in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.

The onboarding page opens. Turn on the sites you want, for example Amazon India. Chrome asks you to confirm each site. Then open a product page and look for the FairCart button near your cursor.

### See it catch something: the demo shop

Real sites rarely show a dark pattern on demand, so the extension includes **DemoMart**, a fictional practice store with deliberate patterns. Open it from settings, the end of onboarding, or the side panel on any non-shopping tab. FairCart reads it with the same generic adapter and rule pack it uses on real sites. Demo prices are never added to price history or comparisons.

| Page | What's planted | What FairCart should raise |
|---|---|---|
| 1 · Product | Paid protection already ticked | Paid add-on already ticked (BASKET-02) |
| | Pop-up with a guilt-trip "no" in tiny faint text | Guilt-tripping decline (SHAME-01), decline much harder to see (IFACE-01) |
| | Deal timer restarts at 09:59 on every load | After one reload: countdown may not be genuine (URG-01) |
| 2 · Basket | Pass and protection added without your choice | Item added without your choice, ×2 (BASKET-01) |
| 3 · Payment | Handling and platform fees appear for the first time | Late checkout fee, ×2 (DRIP-02) |
| | Double-negative WhatsApp checkbox | Confusing wording (TRICK-01) |
| | The pop-up returns after being dismissed | Prompt keeps coming back (NAG-01, after you dismiss it on page 1) |
| | ₹10 in the total that no line explains | Shown by **Scan checkout** |

Remove the pass or protection, or tick things yourself, and the matching findings go away. Use **Start over** to reset. The whole journey is also an automated test (`apps/extension/test/demo.test.ts`).

For development with hot reload:

```bash
npm run dev
```

### Tests

```bash
npm test
```

```bash
npm run typecheck
```

What the tests cover:

- **Rule engine** (`packages/rules/test`): every fixture in `fixtures/cases`, stable finding ids, "why it didn't fire" traces, sensitivity gating, no accusatory wording, and taxonomy/source integrity.
- **Adapters** (`apps/extension/test/adapters.test.ts`): synthetic pages that mirror live Amazon and Flipkart markup, the safety gate, the quick-commerce bill reader with its arithmetic check, and cue extraction.
- **Pricing** (`apps/extension/test/pricing.test.ts`): missing and incomplete history, gaps, discount checks, product matching across variants and brands, and unknown-fee ranking.
- **Journey** (`apps/extension/test/journey.test.ts`): the per-tab reducer, the retailer registry, and an end-to-end late-fee detection across three snapshots.

To regenerate the fixtures after editing `scripts/build-fixtures.ts`:

```bash
npm run fixtures
```

### How it is built

```
faircart/
├─ apps/extension/          WXT + React, Manifest V3
│  ├─ entrypoints/
│  │  ├─ background.ts      journeys, rule evaluation, history, alerts, side-panel sync
│  │  ├─ content/           page reading, tap ledger, companion UI (shadow DOM)
│  │  ├─ sidepanel/         Dark patterns · Compare · History · Saved
│  │  ├─ onboarding/        site opt-in, privacy, preferences
│  │  └─ options/           settings, export, delete data
│  └─ src/
│     ├─ adapters/          amazon, flipkart, generic, bill reader, cues, safety gate
│     ├─ pricing/           history (30-day logic), matching, effective totals
│     └─ store/             journey reducer, chrome.storage wrapper
├─ packages/
│  ├─ schemas/              zod: ScreenSnapshot, Finding, RulePack
│  ├─ taxonomy/             13 categories, sub-patterns, sources S1–S19 with evidence levels
│  └─ rules/                rule evaluator + SPEC.md (shared with the future Kotlin engine)
├─ rulepacks/core.v1.json   the rules, as data
├─ fixtures/cases/          synthetic test screens (platform "generic", never a real retailer)
└─ docs/architecture.html   full product architecture
```

The pipeline works like this:

1. A site adapter turns the page into a `ScreenSnapshot`.
2. The service worker adds it to the tab's journey and runs the rule pack.
3. Findings go back to the page as markers and to the side panel.

Adapters never send page HTML anywhere. Rules never see the DOM.

### Privacy and permissions

**Install-time permissions:** `storage`, `sidePanel`, `scripting` and `alarms`. There is no `<all_urls>`, `tabs`, `history`, `cookies` or `webRequest`.

**Site access:** each retailer origin is an `optional_host_permission`, requested only when you turn that site on. The content script is registered at runtime for granted sites only.

**What FairCart never touches:**
- It never reads input values.
- It skips any page with password, OTP, card or UPI fields, or a known payment-gateway frame.
- It never clicks, unticks, removes or buys anything.

**Network:** none. This build makes no network requests. Everything is stored in `chrome.storage` on this device. Price records older than 400 days are purged, and journeys last only for the browser session.

**Your controls:** you can export or delete all stored data from settings. There are no affiliate links.

### Known limitations and next steps

- **Not yet run as an installed extension.** The extension builds, typechecks and passes its tests, and the adapters were run against live amazon.in and flipkart.com pages. But the companion, markers and side panel have not yet been exercised in a real Chrome profile. Do that first: load it unpacked and walk an Amazon product → cart flow.
- **Adapters will drift.** Retailer markup changes often, especially Flipkart's generated class names. When an adapter can't read a page, the UI says so rather than guessing.
- **Comparison data is sparse at first.** Comparisons only cover products you have opened yourself. Shared history and affiliate APIs need the backend and approved accounts.
- **Some offer terms are not read yet.** Coupons, bank offers and membership-only prices are not read, and the UI says so wherever it matters.
- **Guided repeat tests are not built.** "Reload in 10 minutes to check the timer" style tests are still to come. Findings that depend on them stay at **needs verification**.
