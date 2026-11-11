/**
 * Sources from the research report's Appendix A, with the evidence label the
 * report assigns. Findings link here so the UI can show what kind of evidence
 * stands behind a category. These describe the research, never a platform's
 * current behaviour, and must not be used as a blacklist or detection prior.
 *
 * URLs are intentionally null: the report links titles, but the URLs were not
 * captured in the extracted text. Fill them in from the report before showing
 * links in the UI.
 */
export type EvidenceLevel =
  | 'regulatory_finding'
  | 'official_guidance'
  | 'published_audit'
  | 'reported_experience'
  | 'academic_study'
  | 'explainer'
  | 'legal_analysis';

export interface ResearchSource {
  id: string;
  title: string;
  publisher: string;
  date: string;
  evidenceLevel: EvidenceLevel;
  limitations: string;
  url: string | null;
}

export const SOURCES: readonly ResearchSource[] = [
  { id: 'S1', title: 'CCPA guidelines / official explanation of the 13 categories', publisher: 'Government of India (PIB)', date: '2025-07-22', evidenceLevel: 'official_guidance', limitations: 'Defines the categories; does not assess any platform.', url: null },
  { id: 'S2', title: 'Self-audit advisory announcement', publisher: 'Government of India (PIB)', date: '2025-06-07', evidenceLevel: 'official_guidance', limitations: 'Asks platforms to self-audit; not a finding about any platform.', url: null },
  { id: 'S3', title: '26 platforms self-declared compliance', publisher: 'Government of India (PIB)', date: '2025-11-20', evidenceLevel: 'official_guidance', limitations: 'Self-declarations are not independent verification.', url: null },
  { id: 'S4', title: 'E-commerce marketplace audit and consumer survey', publisher: 'LocalCircles', date: '2025-10-12', evidenceLevel: 'published_audit', limitations: 'Respondent-reported frequency; not a share of all platforms or transactions.', url: null },
  { id: 'S5', title: '21 of 26 self-declarants still had patterns; drip pricing on 11', publisher: 'LocalCircles', date: '2025-11-26', evidenceLevel: 'published_audit', limitations: 'Cross-sector audit of 300+ platforms; not an e-commerce-only denominator. Time-bound.', url: null },
  { id: 'S6', title: 'Dark Patterns in India\'s Online Marketplaces (public summary)', publisher: 'Datum Intelligence', date: '2026-06', evidenceLevel: 'published_audit', limitations: 'Survey-derived composite index; not a legal finding or certification.', url: null },
  { id: 'S7', title: 'Summary of Datum\'s 2026 research', publisher: 'The Indian Express', date: '2026-06-11', evidenceLevel: 'reported_experience', limitations: 'Press coverage of a third-party study.', url: null },
  { id: 'S8', title: 'Summary of Datum\'s 2026 research', publisher: 'Business Standard', date: '2026-06-09', evidenceLevel: 'reported_experience', limitations: 'Press coverage of a third-party study; loss figures are model extrapolations.', url: null },
  { id: 'S9', title: 'From Zepto to Blinkit: Dark Patterns Behind the Quick Commerce Boom', publisher: 'Inc42', date: '2025-03-16', evidenceLevel: 'reported_experience', limitations: 'Journalism and user reports; may have changed since and may depend on conditions.', url: null },
  { id: 'S10', title: '10 Minute delivery apps are fooling you', publisher: 'Zero1 by Zerodha', date: '2024-11-12', evidenceLevel: 'explainer', limitations: 'Video explainer; examples should be re-tested before treating as current.', url: null },
  { id: 'S11', title: 'I investigated India\'s biggest Online Sale!', publisher: 'Zero1 by Zerodha', date: '2026-08-14', evidenceLevel: 'explainer', limitations: 'Video explainer; not an independent live UI audit.', url: null },
  { id: 'S12', title: 'Dark Patterns at Scale: Findings from a Crawl of 11K Shopping Websites', publisher: 'Princeton / ACM', date: '2019', evidenceLevel: 'academic_study', limitations: 'International crawl; bounded sample, not India-wide prevalence.', url: null },
  { id: 'S13', title: 'Behavioural study on unfair commercial practices in the digital environment', publisher: 'European Commission', date: '2022', evidenceLevel: 'academic_study', limitations: 'EU sample; not India-specific.', url: null },
  { id: 'S14', title: 'Study of Deceptive Patterns in top Indian apps', publisher: 'Conscious Patterns', date: 'n.d.', evidenceLevel: 'published_audit', limitations: 'Bounded sample of 50+ apps; not all Indian commerce apps.', url: null },
  { id: 'S15', title: 'The Dark Store Index: quick-commerce sponsored shelf observations', publisher: 'The Dark Store Index', date: '2026-07-24', evidenceLevel: 'published_audit', limitations: 'Shows paid placement is common; does not by itself show disguised advertising. Varies by store and city.', url: null },
  { id: 'S16', title: 'CCPA penalties against digital platforms', publisher: 'Government of India (PIB)', date: '2026-06-03', evidenceLevel: 'regulatory_finding', limitations: 'Specific orders; applies to the practices and time named in each order.', url: null },
  { id: 'S17', title: 'Lok Sabha reply listing 2026 enforcement and platform declarations', publisher: 'PolicyIndex (reproduction)', date: '2026', evidenceLevel: 'regulatory_finding', limitations: 'Reproduction of an official reply; practices named were later reported as discontinued.', url: null },
  { id: 'S18', title: 'Dark Patterns Decoded: India\'s Legal and Regulatory Guide', publisher: 'Nishith Desai Associates', date: '2026', evidenceLevel: 'legal_analysis', limitations: 'Legal commentary; not an authority finding.', url: null },
  { id: 'S19', title: 'Jago Grahak Jago / Jagriti apps', publisher: 'Department of Consumer Affairs', date: '2024-12-22', evidenceLevel: 'official_guidance', limitations: 'Consumer awareness and reporting channels.', url: null },
];

/** National Consumer Helpline, cited in report §12. */
export const CONSUMER_HELPLINE = { name: 'National Consumer Helpline', number: '1915' } as const;
