/** Plain statement of data handling, shown in onboarding and settings. Keep in sync with docs/privacy. */
export function PrivacyFacts() {
  return (
    <div className="privacy">
      <dl>
        <div>
          <dt>Reads</dt>
          <dd>Visible prices, fees, bill lines, product names and identifiers, timers, stock and ad labels, and whether add-on boxes are ticked, only on sites you turned on.</dd>
        </div>
        <div>
          <dt>Never reads</dt>
          <dd>What you type, passwords, OTPs, card or UPI details, messages, or other websites. Pages with password or payment fields are skipped entirely.</dd>
        </div>
        <div>
          <dt>Processing</dt>
          <dd>Everything runs inside your browser. This version sends nothing to FairCart or anyone else: no server, no AI service, no analytics.</dd>
        </div>
        <div>
          <dt>Stored</dt>
          <dd>Product names, prices you saw and when, your watch targets and findings, on this device only. Shopping journeys are kept for the browser session. Price records older than 400 days are deleted.</dd>
        </div>
        <div>
          <dt>Your controls</dt>
          <dd>Turn sites off, pause FairCart on a site, export what it stored, or delete everything from settings.</dd>
        </div>
        <div>
          <dt>Money</dt>
          <dd>FairCart has no affiliate links and no paid placements. Links to stores are plain links.</dd>
        </div>
      </dl>
    </div>
  );
}
