# PennyWise for PayPal: video script and Devpost text

Live demo: https://pennywise-for-paypal.onrender.com
Repository: https://github.com/CarolDsillva/pennywise-for-paypal

## Before you press Submit

- [ ] Run one real purchase on the live site end to end (Try it yourself → Let my agent buy it → approve the fees → log in to PayPal with the sandbox buyer → receipt). Fix anything that breaks before recording.
- [ ] Put the sandbox buyer's email and password in the **Testing instructions** below and in the README. The rules require any sandbox login judges need.
- [ ] Check `PAYPAL_WEBHOOK_ID` is set in Render. If it isn't, remove "verified webhooks" from the text below (receipts would stay at "Captured: waiting for PayPal webhook").
- [ ] Upload the video (public, under 3 minutes) and paste the link at the bottom.
- [ ] Add 3–5 screenshots to the Devpost gallery: the hero, the product demo blocking payment, the peek result, a receipt, Merchant fairness.
- [ ] Keep Render, the Gemini key and the PayPal sandbox app running until judging ends on 15 Dec.

---

## Video (under 3 minutes)

Record in Chrome at 1440×900 or larger, on the live site. Open the site a minute before so it's warm. Run the real purchase once before recording so you know the timing; the edit can speed up the agent's waits.

Rules: YouTube, public, under 3 minutes, showing the project working. No music unless it's royalty-free.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00 | The hero | "AI agents are starting to buy things for us. Checkouts are full of tricks built to catch people: add-ons already ticked, fees that appear at the last step, charges nobody explains. An agent falls for them even more easily. PennyWise sits between your agent and PayPal, so the agent can only pay what you agreed to." |
| 0:20 | Click **Watch the demo**. Let it play: rules, the trap (numbered badges appear) | "I give my agent one job: buy this coffee, at most $25, delivery fees only. That's my intent mandate. On the product page, PennyWise spots four tricks before the agent touches anything." |
| 0:35 | The agent shops: declines the pop-up, unticks the plan, removes the pass | "The agent says no to the pop-up, unticks the plan I never asked for, and removes a pass DemoMart slipped into the basket." |
| 0:50 | Blocked at payment: badges on the bill, numbered list beside it | "At payment, two new fees and a dollar nobody explains. PennyWise blocks it. This is plain code, not AI, so text on the page can't talk it round. The agent disputes the dollar itself; only I can allow the fees." |
| 1:10 | You decide → signed → paid, receipt | "Once every cent matches, PennyWise signs a cart mandate, and PayPal moves only that amount. DemoMart tried $21.95. I paid $13.97." |
| 1:20 | Click **Try it yourself**. Pick a product (for example olive oil), click **Peek at costs** | "That demo is scripted so it plays the same every time. This is the live product: a real AI agent, Gemini, and PayPal sandbox. Any of 174 products. Peek shows what the shelf price hides, with nothing bought." |
| 1:40 | Click **Let my agent buy it**. Speed up the agent's steps; show the "On this page" list | "Now the agent shops it for real. It reads each page, plans one step at a time, and can't pay or approve anything itself." |
| 2:00 | The approval card, approve; then **Log in to PayPal**, sandbox login, approve | "PennyWise blocks the extra fees and asks me. Then, and only then, I log in to PayPal once." |
| 2:15 | Payment steps and the receipt | "PayPal authorizes and holds the money, PennyWise reads the PayPal order back line by line, and only then is it captured. The agent paid by itself, inside my rules." |
| 2:35 | **Merchant fairness** | "Every checkout feeds an honesty record per merchant, built with AG Grid: what each store tried to charge, and what was stopped." |
| 2:48 | Back to the hero | "The AI proposes. PennyWise checks. PayPal moves only the money you agreed to. PennyWise for PayPal." |

---

## Devpost

**Project name:** PennyWise for PayPal

**Tagline:** Your AI can shop for you. PennyWise makes sure it doesn't get tricked doing it.

### Inspiration
AI agents are starting to shop and pay for people. But checkouts are full of dark patterns: protection plans already ticked, passes slipped into the basket, fees that appear only at payment, amounts no line explains. India's consumer regulator listed 13 of them in 2023, and the same tricks run on stores everywhere. A person sometimes notices. An agent following instructions usually doesn't, and some pages now carry text written to instruct AI agents. We wanted agents to pay with PayPal safely, without anyone having to trust the AI with money.

### Who it's for
- **People who let an AI agent shop for them**, so the agent can't be tricked into paying more than they agreed to.
- **PayPal**, as a wallet-side guard for agentic commerce. The wallet already sees every order and knows what the buyer approved, so it is the natural place for this check.
- **Honest merchants**, who get a fairness record that shows they don't play these tricks.

### What it does
You tell your agent what to buy and the rules: the most to spend and which fees are fine. PennyWise signs this as an **intent mandate**.

The agent shops a real-looking store of 174 products in a live browser. PennyWise reads every page and marks each trick it finds with a numbered badge. The agent undoes what it can: it declines upsells, unticks add-ons, removes what you never asked for, and disputes amounts nobody explains.

At checkout, a deterministic checker re-adds the bill and compares it with your mandate. Anything outside the rules is blocked, and only you can approve an extra fee, by name.

When the cart matches, PennyWise signs a **cart mandate**. You log in to PayPal once, at the end. The agent then pays by itself: PayPal **authorizes** and holds the money, PennyWise reads the order back from PayPal and checks it line by line, and only then is it **captured**. The receipt shows what the store tried to charge, what was blocked, and what you paid.

**Peek** shows any product's hidden costs without buying anything. **Merchant fairness** (AG Grid) turns every run into a per-merchant honesty record.

The site opens with a 45-second product demo that plays by itself. Then **Try it yourself** runs the live agent and PayPal sandbox on two stores with the same shelves: DemoMart, with a trick on every product, and FairMart, the honest control.

### How we built it
- **Engine:** FairCart, our dark-pattern engine: a rule pack for the 13 regulator-listed categories, page adapters that read prices, bills, add-ons and pop-ups from any store page, and a journey model that catches fees appearing late.
- **Checker:** a pure TypeScript function. Money is integer cents; mandates and authorizations are HMAC-signed and single-use.
- **AI planner:** Gemini plans one page at a time through a single forced function call. Every action is checked against the controls actually on the page. The planner never sees raw HTML and has no payment tools.
- **PayPal:**
  - Orders v2 through PayPal's TypeScript Server SDK (generated by APIMatic);
  - Vault v3 to save the buyer's wallet for the agent;
  - intent AUTHORIZE, then verify, then capture, so PayPal holds the money until PennyWise has compared the order;
  - JS SDK buttons for buyer-approved payments;
  - verified webhooks to settle captures.
- **Product:** a React console and a Hono server, deployed on Render from a Blueprint.

### What we built during the hackathon
FairCart's rule pack and page adapters came from an earlier browser-extension proof of concept of ours and entered this repository as one baseline commit. Everything else is new in this project:
- the agent loop (Gemini planner, page-by-page driver, backup planner);
- the checker, intent and cart mandates, and signed single-use authorizations;
- the PayPal integration (Server SDK orders, Vault, authorize–verify–capture, webhooks);
- the two practice stores with 174 products;
- the console, product demo, peek and Merchant fairness ledger;
- the deployment on Render.

We also extended FairCart itself: it now reads dollar prices, recognises text aimed at AI agents, and reads action buttons for the agent.

### Challenges we ran into
- Agents don't see what people see. We read pages through FairCart's structured adapter, so text on the page aimed at AI can't steer payments.
- An agent paying with a saved wallet could complete a payment before anyone checks it. We use intent AUTHORIZE, so PayPal only holds the money until PennyWise has compared the order.
- Free-tier AI is sometimes slow or overloaded, and sometimes returns a plan that doesn't fit the page. A labelled backup planner (no AI) covers that page, and finishes the run if the AI can't be reached.

### Accomplishments we're proud of
- Nothing the AI outputs can move money or change an amount.
- The same engine works on any product in either store, with nothing written for a particular product.
- The vocabulary lines up with the Agent Payments Protocol: intent and cart mandates, human-present and human-not-present payment.

### What we learned
Trust in agent payments shouldn't depend on the model being smart. It should depend on a small piece of code the model can't talk its way past, and on the wallet seeing what the merchant charges.

### What's next
- Run the checker inside the wallet, where PayPal already sees every order.
- Attach mandate IDs to disputes as evidence.
- Bring the same engine to people shopping by hand, through the FairCart browser extension.

### Prize categories
- **Best Use of Agentic Commerce:** an agent that pays by itself, inside intent and cart mandates, with human-not-present payment through a vaulted PayPal wallet.
- **Best Use of PayPal + AI:** Gemini plans; PayPal Orders, Vault and authorize–verify–capture move only the approved amount.
- **AG Grid:** Merchant fairness is an AG Grid ledger: per-merchant honesty score, every run, every blocked charge, and CSV export.
- **APIMatic:** orders and payments go through PayPal's TypeScript Server SDK, generated by APIMatic.
- **Render:** one web service from a `render.yaml` Blueprint, with a health check, auto-deploy from `main`, and a persistent disk that keeps the Merchant fairness ledger across deploys.

### Testing instructions for judges
1. Open https://pennywise-for-paypal.onrender.com and press **Watch the demo** (45 seconds, no login).
2. Click **Try it yourself**. Pick a product, then **Peek at costs** to see what the shelf price hides (no login, no AI).
3. Click **Let my agent buy it**. Approve the fees when asked. When you see **Last step: log in to PayPal**, use this sandbox buyer:
   - Email: _add the sandbox buyer email_
   - Password: _add the sandbox buyer password_
4. After the receipt, open **Merchant fairness**.

The agent uses Gemini's free tier. If Gemini is busy, a labelled backup planner (no AI) finishes the run. PayPal runs in sandbox: no real money moves.

### Built with
TypeScript, React, Vite, Hono, Node.js, Zod, Vitest, PayPal Orders v2, PayPal Vault v3, PayPal JS SDK, PayPal webhooks, PayPal TypeScript Server SDK (APIMatic), Google Gemini, AG Grid, Render.

### AI tools used, and how
- **Google Gemini** (`gemini-3.5-flash-lite`) is the shopping agent's planner. For each page it receives a structured brief: the controls, prices, fees, PennyWise's findings, and the checker's last verdict. It returns an ordered list of actions through one forced function call, `submit_plan`. It has no tool that can pay, approve a charge or change the mandate.
- **A deterministic backup planner** (no AI) takes over when Gemini is unavailable. The UI labels it.
- **The checker is not AI.** It is plain code that decides whether money may move.
- The product demo on the landing page uses a fixed script for the agent's clicks and simulates the PayPal step, so it plays the same every time; the page says so. Try it yourself is the live agent.

### Links
- Demo: https://pennywise-for-paypal.onrender.com
- Code: https://github.com/CarolDsillva/pennywise-for-paypal (MIT)
- Video: _add the YouTube link_
