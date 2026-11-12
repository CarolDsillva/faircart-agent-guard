# PennyWise for PayPal: video script and Devpost text

Live demo: https://pennywise-for-paypal.onrender.com
Repository: https://github.com/CarolDsillva/pennywise-for-paypal

---

## Video (under 3 minutes)

Record at 1440×900 or larger, in Chrome, on the live site. Open the site a minute before recording so it's warm. Speak slowly; the agent's steps take a few seconds each, and the edit can speed up waiting.

Devpost rules: YouTube, public, under 3 minutes, showing the project working. No third-party music unless it's licensed: use none, or royalty-free.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00 | Agent page | "AI agents are starting to buy things for us. But checkouts are full of tricks built to catch people: pre-ticked add-ons, fees that appear at the last step, charges nobody explains. An agent falls for them even more easily. This is PennyWise." |
| 0:15 | Pick Bluebird Roasters Whole Bean Coffee 12 oz, DemoMart. Set $25, delivery fee OK, agent pays on its own | "I tell my agent what to buy and the rules: at most $25, delivery fees only, and it may pay with PayPal on its own, inside these rules. That's my intent mandate." |
| 0:25 | Click "Peek at the hidden costs". The store opens; PennyWise reads the product page, then the payment page | "First, a peek. PennyWise walks DemoMart's real checkout without buying anything." |
| 0:35 | Peek result: $11.49 on the shelf, $21.95 at payment, five hidden costs marked on the page | "The coffee is $11.49 on the shelf. At payment DemoMart charges $21.95: a protection plan ticked for me, a pass I never chose, two fees that only appear now, and $1.00 nobody explains." |
| 0:45 | Click "Let my agent buy it" | "Now the same screen, but my agent shops it." |
| 0:58 | The agent shops. Cursor taps; steps appear on the right | "The agent declines the pop-up, unticks the plan and removes the pass it never chose." |
| 1:15 | Payment page. Red marks on the bill. "PennyWise blocked payment" card | "At payment, new fees appear and $1.00 nobody can explain. PennyWise blocks the payment. It's code, not the AI, so it can't be argued with. The agent disputes the $1.00 through the store's own help, then asks me about the fees." |
| 1:40 | Approve the two fees | "Only I can approve extra charges, by name. The agent can't." |
| 1:50 | "Last step: log in to PayPal". Sandbox login, approve; then payment steps and the receipt | "Now the cart matches, PennyWise signs a cart mandate. I log in to PayPal once, and the agent pays by itself. PayPal holds the money, PennyWise checks the PayPal order line by line, and only then is it captured. DemoMart tried $21.95. I paid $13.97." |
| 2:15 | Shop something else. Open a different product (for example a floor cleaner) and start the agent; speed it up in the edit | "It works on anything in the store, because nothing is written for one product. Same tricks, caught the same way." |
| 2:30 | Switch to the FairMart tab, scan a product page: nothing found | "On FairMart, the honest store, PennyWise stays quiet." |
| 2:38 | Merchant fairness view | "Across every checkout, PennyWise builds an honesty record for each merchant: what they tried to charge, and what was stopped." |
| 2:48 | Back to the store | "The AI proposes. PennyWise checks. PayPal moves only the money you agreed to. PennyWise for PayPal." |

---

## Devpost

**Project name:** PennyWise for PayPal

**Tagline:** Your AI can shop for you. PennyWise makes sure it doesn't get tricked doing it.

### Inspiration
AI agents are starting to shop and pay for people. But Indian checkouts, and checkouts everywhere, are full of dark patterns: protection plans already ticked, passes slipped into the basket, fees that appear only at payment. India's consumer regulator (CCPA) named 13 of them in 2023. A person sometimes notices. An agent following instructions usually doesn't, and some pages now carry text written to instruct AI agents. We wanted agents to pay with PayPal safely, without anyone having to trust the AI with money.

### What it does
You set your agent's rules once: the most to spend per order and which fees are fine. Then you shop a real-looking store of 183 products and hand any product to the agent. Each purchase becomes an **intent mandate**. With autopay on, you log in to PayPal once, at the end, and the agent pays on its own.

The agent shops the store in a live browser. You watch its cursor work while PennyWise boxes each trick it finds. The agent undoes what it can: it unticks add-ons, declines upsells, removes what you never asked for, and disputes charges nobody explains.

At checkout, a deterministic checker re-adds the bill and compares it with your mandate. Anything outside the rules is blocked. Only you can approve an extra fee, by name.

When the cart matches, PennyWise signs a **cart mandate**. The store creates the PayPal order, PennyWise reads the order back from PayPal and checks it line by line, and only then is the payment captured. The receipt shows what the store tried to charge, what was blocked, and what you paid.

A **Merchant fairness** view, built with AG Grid, turns every run into a per-merchant honesty record.

You can also scan any page yourself, with no agent, to see the tricks PennyWise finds.

The demo has two stores with the same shelves: DemoMart, with a trick on every product, and FairMart, the honest control. One engine, nothing written for a particular product or store; the same engine also handles a flight checkout.

### How we built it
- **Engine:** FairCart, our open dark-pattern engine. It has a rule pack covering the 13 CCPA categories, page adapters, and a journey model that catches fees appearing late.
- **Checker:** a pure TypeScript function. Money is integer paise and cents; authorizations are HMAC-signed and single-use.
- **AI planner:** Gemini plans one page at a time through a single forced function call. Every action is validated against the controls actually on the page. The planner never sees raw HTML and has no payment tools.
- **PayPal:**
  - Orders v2 through PayPal's TypeScript Server SDK (generated by APIMatic);
  - Vault v3 to link the wallet;
  - authorize, verify, capture for agent payments;
  - JS SDK buttons for buyer approval;
  - verified webhooks.
- **Hosting:** a React console and a Hono server on Render.

### Challenges we ran into
- Agents don't see what people see. We read pages through FairCart's structured adapter, so text on the page aimed at AI can't steer payments.
- An agent paying with a saved wallet can complete a payment before anyone checks it. We use intent AUTHORIZE, so PayPal only holds the money until PennyWise has compared the order.
- Free-tier AI is slow and sometimes overloaded, and sometimes returns a plan that doesn't fit the page. A labelled backup planner (no AI) covers that page, and finishes the run if the AI can't be reached.

### Accomplishments we're proud of
- Nothing the AI outputs can move money or change an amount.
- The same engine works on any product in the store, and on a flight checkout too.
- The vocabulary lines up with the Agent Payments Protocol: intent and cart mandates, human-present and human-not-present payment.

### What we learned
Trust in agent payments shouldn't depend on the model being smart. It should depend on a small piece of code that the model can't talk its way past, and on the wallet seeing what the merchant charges.

### What's next
- Run the checker inside the wallet, where PayPal already sees every order.
- Attach mandate IDs to disputes as evidence.
- Bring the same engine to people shopping by hand, through the FairCart browser extension.

### Built with
TypeScript, React, Vite, Hono, Node.js, Zod, Vitest, PayPal Orders v2, PayPal Vault v3, PayPal JS SDK, PayPal webhooks, PayPal TypeScript Server SDK (APIMatic), Google Gemini, AG Grid, Render.

### AI tools used, and how
- **Google Gemini** (`gemini-3.5-flash-lite`) is the shopping agent's planner. For each page it receives a structured brief: the controls, prices, fees, PennyWise's findings, and the checker's last verdict. It returns an ordered list of actions through one forced function call, `submit_plan`. It has no tool that can pay, approve a charge or change the mandate.
- **A deterministic backup planner** (no AI) takes over when Gemini is unavailable. The UI labels it.
- **The checker is not AI.** It is plain code that decides whether money may move.

### Links
- Demo: https://pennywise-for-paypal.onrender.com
- Code: https://github.com/CarolDsillva/pennywise-for-paypal (MIT)
- Video: _add the YouTube link_
