# PennyWise for PayPal

*Checkout protection for people and their AI agents. Built on FairCart, our open dark-pattern engine, first written for Indian e-commerce and now reading checkouts in dollars too.*

**AI agents are starting to shop for us. Stores are built to trick shoppers, and an agent is easier to trick than a person.** It won't notice a protection plan that's already ticked, a fee that only appears at payment, a dollar in the total that no line explains, or text on the page written to manipulate it.

PennyWise is a **mandate guard for agent payments**: the layer that decides when an AI agent may pay with your PayPal, and lets it pay **on its own** only when the purchase matches what you signed.

> **The AI proposes. PennyWise sees. Code decides. PayPal moves only the money you approved.**

In the demo, you sign an **intent mandate** ("a 12 oz bag of whole bean coffee, at most $25, delivery fees only"). An AI agent then shops DemoMart, a store full of deliberate dark patterns that tries to charge **$21.95** for an **$11.49** product. The agent unticks the protection plan, removes the pass it never chose, and disputes the $1.00 nobody explained. It asks you about the two fees it can't remove. When the bill matches, PennyWise signs a **cart mandate**; you log in to PayPal once, at the end, and the agent pays by itself. PayPal holds **$13.97**, PennyWise checks the PayPal order line by line, and only then is it captured. The receipt says: *DemoMart tried $21.95. You paid $13.97. You saved $7.98.*

### Why this should exist inside PayPal

Agentic commerce needs a trusted party that knows what the user agreed to and sees what the merchant is charging. That is the wallet. PennyWise shows what a wallet-side guard does:
- It turns the user's words into a signed **intent mandate**.
- It reads the checkout the agent sees.
- It signs a **cart mandate** only for a matching cart.
- It releases human-not-present payment only against that cart mandate.

The vocabulary follows the Agent Payments Protocol (AP2), which PayPal supports: intent mandate, cart mandate, human-present and human-not-present purchases.

Built for the PayPal AI Hackathon (Devpost). MIT licensed.

### For judges: try it in 2 minutes

1. Open **https://pennywise-for-paypal.onrender.com** and press **Watch the demo** (45 seconds, plays by itself, no login).
2. Click **Try it yourself**. Pick a product, then **Peek at costs** to see what the shelf price hides (no login, no AI).
3. Click **Let my agent buy it**. Approve the fees when asked. At **Last step: log in to PayPal**, use the sandbox buyer:
   - Email: _add the sandbox buyer email_
   - Password: _add the sandbox buyer password_
4. After the receipt, open **Merchant fairness**.

PayPal runs in sandbox, so no real money moves. The agent uses Gemini's free tier; if it's busy, a labelled backup planner (no AI) finishes the run.

**Prize categories:**
- **Agentic Commerce:** the agent pays by itself inside intent and cart mandates, through a vaulted PayPal wallet.
- **PayPal + AI:** Gemini plans; PayPal Orders, Vault and authorize–verify–capture move only the approved amount.
- **AG Grid:** the Merchant fairness ledger.
- **APIMatic:** orders and payments go through PayPal's APIMatic-generated TypeScript Server SDK.
- **Render:** a Blueprint (`render.yaml`) web service with a health check, auto-deploy, and a persistent disk for the ledger.

**What existed before:** FairCart's rule pack and page adapters came from an earlier browser-extension proof of concept and entered this repository as one baseline commit. Everything PennyWise adds (the agent, checker, mandates, PayPal integration, stores, console, product demo and ledger) was built during the hackathon; see the commit history.

## Any product, one engine

The demo is two practice stores with the same 174 products across nine aisles:
- **DemoMart** puts a trick at every step of checkout, on every product: a pre-ticked protection plan, a pass slipped into the basket, fees that appear only at payment, $1.00 nobody explains, and product text written to instruct AI agents. For the $11.49 coffee it tries to charge $21.95.
- **FairMart** sells the same shelves honestly. PennyWise stays quiet and the agent pays.

Nothing is written for a particular product or store: the same reader, rule engine and checker handle whatever you pick. The engine also handles a flight checkout (SkyHop, in the code and tests). While the agent works, you see its cursor tap the page, PennyWise box each trick it finds, and the checker mark the exact bill lines it blocks.

## Try it

**Live demo: https://pennywise-for-paypal.onrender.com**

1. **Watch the demo.** The landing page opens with a 45-second product demo that plays by itself: your rules, the tricks PennyWise spots, the agent shopping, the checker blocking payment, your approval, the signed cart and the receipt. It runs on the real store pages and the real checker; the agent's clicks are scripted and the PayPal step is simulated, so it plays the same every time, and the page says so.
2. **Try it yourself** (top bar) is the live product. One bar: what to buy (search 174 products, or open any product in the store), DemoMart (tricky) or FairMart (honest), the most to spend, and **Rules** (which fees are fine, and whether the agent pays on its own).
3. **Peek at costs** (no agent, no AI): PennyWise opens the store's real product and payment pages, reads them, and lists every charge the shelf price leaves out, each with a numbered badge on the page. For the $11.49 coffee on DemoMart: $21.95 at payment, five hidden costs. On FairMart: exactly $11.49.
4. **Let my agent buy it:** the same screen, but now the Gemini agent shops it. Its cursor taps through the store, PennyWise numbers each trick on the page, and the panel lists them and narrates each step.
5. When a charge falls outside your rules and the agent can't remove it, it asks you. Approve the fee by name, or choose **Don't buy**.
6. With autopay on, PayPal login comes **at the end**: once PennyWise signs the cart mandate, you log in to PayPal once (Vault, sandbox) and the agent pays by itself. PayPal holds the money, PennyWise checks the order line by line, and only then is it captured.
7. **Merchant fairness** (top bar) shows every finished run, including product-demo runs (labelled "Demo · payment simulated").

The first planning step can take 10 to 20 seconds while Gemini responds. If Gemini is unreachable, a labelled backup planner (no AI) finishes the run. If Gemini returns a plan that doesn't fit the page, the backup planner handles that one page and Gemini plans the next.

## How it works

```
 Browser (your environment)                         Server (Node 22, Hono, one service)
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────────┐
│ Store iframe (DemoMart / FairMart)      │       │ PennyWise side                                │
│   ▲ act by control id   │ live page     │       │  Run state, signed instructions, audit log   │
│ ┌─┴────────┐  ┌─────────▼────────────┐  │       │  Rule engine re-run on the journey           │
│ │ Driver   │  │ Sensor: PennyWise's   │──obs──►  │  Planner: Gemini, one call per page          │
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
- **Page text is data.** DemoMart's product description tells AI assistants the protection plan is "mandatory". The planner only sees a structured page brief, with page text marked untrusted. And even if a model believed it, the checker blocks the $1.99.
- **Money is integer minor units** (cents, or paise for rupee stores), never floats. The demo stores price in US dollars, so PayPal gets the same cents the checker approved; rupee stores convert per line at a fixed, displayed rate (₹88 = US$1), so the order always reconciles.

### PayPal

- **DemoMart is the merchant of record.** PennyWise never receives money.
- **Agent wallet (human-not-present):** with autopay on, once the checker has signed the cart you link PayPal through **Vault v3** (setup token → your approval → payment token). Login comes only at the end, when there is something to pay. After the checker signs the cart mandate, DemoMart creates the order with `payment_source.paypal.vault_id` and **`intent: AUTHORIZE`**, so PayPal only *holds* the money. PennyWise reads the order back and compares it with the cart mandate. Only then is the authorization captured; on any mismatch the hold is **voided**. No pop-up, and no way for the agent to pay outside the mandates.
- The checker's PASS produces an **HMAC-signed, single-use authorization** (30 minutes to create the order). DemoMart's agent-checkout endpoint verifies it and creates an **Orders v2** order with every line as an item (`PayPal-Request-Id` = authorization id, so retries are idempotent).
- **PennyWise then reads the PayPal order back** and compares every item, amount and the currency with the authorization before the buyer can approve. A mismatch stops the run.
- After the buyer approves (JS SDK buttons), DemoMart captures, the captured amount is checked again, and a **verified `PAYMENT.CAPTURE.COMPLETED` webhook** marks the run settled.
- PennyWise is designed to sit in front of agents built on PayPal's tools, including the PayPal Agent Toolkit. Here, orders go through PayPal's Server SDK with exact cents, per-order idempotency (`PayPal-Request-Id`) and `invoice_id`, because the guard needs all three.

### Merchant fairness (AG Grid)

The **Merchant fairness** view is built with **AG Grid** (Community, MIT). It shows every finished agent run, kept on a Render persistent disk so it survives restarts and deploys (`DATA_DIR`; locally `./data`). Product-demo runs appear too, labelled "Demo · payment simulated", and are not counted as money paid:
- what the store tried to charge, what PayPal moved and what PennyWise saved;
- who approved the payment (the agent wallet, or you in PayPal), the intent and cart mandate ids, and the PayPal order;
- a second grid of every charge PennyWise blocked, by dark pattern ("Pre-ticked add-on", "Added without your choice", "Unexplained amount").

It has totals cards, a pinned totals row, sorting, filtering and CSV export.

### PayPal Server SDK (APIMatic)

Orders and payments (create, get, authorize, capture, capture authorization, void) go through **PayPal's official TypeScript Server SDK, `@paypal/paypal-server-sdk`, which is generated by APIMatic** (`apps/server/src/paypal/sdk.ts`). Two calls stay on plain REST, because the SDK doesn't cover them:
- **Vault setup tokens:** the SDK's PayPal-wallet vault model has no experience context, so it can't carry a return URL.
- **Webhook signature verification:** the SDK has no call for it.

### AI

- **Gemini** (`gemini-3.5-flash-lite` by default; set `LLM_MODEL` to change it) plans one page at a time through a single forced function call, `submit_plan`. Every action is validated: it must use a tool from a fixed list and a control id that exists on the page.
- If Gemini is unavailable (rate limits, overload, timeouts), a deterministic **backup planner (no AI)** finishes the run from PennyWise's reading of the page. The UI labels it clearly. It knows nothing about DemoMart: it unticks paid add-ons, declines pop-ups, removes what wasn't asked for, and questions unexplained amounts.

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

- The agent wallet's payment token lives in server memory for the run (30 minutes). A real wallet would keep it with PayPal and the customer.
- The server trusts the browser's **reading of the page**, just as a careful human trusts what they see. It does not trust the browser's findings, verdicts, amounts or instructions: it re-runs the rule engine, re-adds the bill, owns your instructions, and checks the PayPal order itself.
- In this demo, PennyWise reads the PayPal order with the same sandbox app the store uses, standing in for the order details PayPal shows the payer.
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
| `apps/server` | runs API, payments ledger API, DemoMart merchant API, PayPal client (APIMatic-generated PayPal Server SDK), Gemini provider |
| `apps/web` | the run console, the AG Grid payments ledger and the store pages |
| `apps/shop` | DemoMart and FairMart |
| `apps/extension` | the FairCart Chrome extension, where this started (the same engine, for people shopping on real sites) |

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
