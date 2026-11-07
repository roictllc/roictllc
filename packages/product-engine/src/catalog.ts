/**
 * Seed catalog (spec §12). Prices here are SEED values only — the database is the source of truth and the
 * admin edits them in /admin/products (new price version per edit). Integration keys gate visibility (spec §0.2).
 */
export type Interval = 'ONE_TIME' | 'MONTH' | 'YEAR';
export interface SeedPlan {
  slug: string;
  name: string;
  description?: string;
  amountCents: number | null; // null = quote / priced per item
  interval: Interval;
  isDefault?: boolean;
  published?: boolean;
  features: string[];
}
export interface SeedProduct {
  number: number;
  slug: string;
  name: string;
  category: 'branding' | 'websites' | 'growth' | 'social' | 'ai' | 'library';
  tagline: string;
  shortDescription: string;
  longDescription: string;
  answerFirst: string; // 40–60-word direct answer (AEO, spec §7.1)
  kind: 'ONE_TIME' | 'SUBSCRIPTION' | 'QUOTE' | 'PER_ITEM';
  deliveryMode: 'AUTOMATED' | 'MANAGED' | 'HYBRID';
  requiredIntegrations: string[];
  taxCode: string;
  honesty?: string;
  plans: SeedPlan[];
  faq: Array<{ q: string; a: string }>;
  cost: Partial<{
    computeSecondsExpected: number; storageMillicents: number; emailMillicents: number; domainCostCents: number;
    socialApiMillicentsPerPost: number; postsPerPeriod: number; supportAllowanceCents: number; refundAllowanceBps: number;
  }>;
  workflow: string[];
}

// Stripe tax codes: txcd_10000000 = general electronically supplied services; txcd_10103000 = SaaS (business use);
// txcd_10302000 = digital books. Verified against Stripe's tax code list at build time (documentation/products/tax-codes.md).
export const CATALOG: SeedProduct[] = [
  {
    number: 11, slug: 'ai-visibility', name: 'AI Visibility', category: 'ai',
    tagline: 'Get recommended by ChatGPT, Gemini, Claude and Perplexity.',
    shortDescription: 'We make AI assistants and AI search understand, trust and surface your business when customers ask who to hire.',
    longDescription:
      'More customers now ask an AI assistant instead of scrolling search results. ROI audits how AI engines read your business, fixes what keeps them from understanding you — structured data, entity consistency, answer-ready content, listings and llms.txt — and tracks how often engines mention you for the questions your customers really ask.',
    answerFirst:
      'AI Visibility is ROI’s service for making ChatGPT, Gemini, Claude, Perplexity and Copilot understand and surface your business. We score your site for AI readability, implement the fixes (schema, llms.txt, answer pages, consistent listings) and track mention rates for real customer questions. No engine can be forced to recommend anyone; we improve the signals they rely on.',
    kind: 'SUBSCRIPTION', deliveryMode: 'HYBRID', requiredIntegrations: ['stripe', 'resend'], taxCode: 'txcd_10103000',
    honesty: 'No AI engine can be forced to recommend a business. ROI improves how AI understands and surfaces you; results are measured, never guaranteed.',
    plans: [
      { slug: 'audit', name: 'Free AI Visibility Audit', amountCents: 0, interval: 'ONE_TIME', published: true, features: ['0–100 AI visibility score', 'Prioritized fix list', 'Shareable report page'] },
      { slug: 'essentials', name: 'Essentials', amountCents: 4900, interval: 'MONTH', isDefault: true, published: false, features: ['Implementation on ROI-hosted sites', '10 tracked customer questions', 'Monthly report'] },
      { slug: 'growth', name: 'Growth', amountCents: 9900, interval: 'MONTH', published: false, features: ['Everything in Essentials', '50 tracked questions across engines', 'Answer pages & entity profile', 'Listing-consistency worksheet'] },
    ],
    faq: [
      { q: 'Can you guarantee ChatGPT will recommend my business?', a: 'No. Nobody can force an AI engine to recommend a business. We improve the signals AI systems rely on — clear entity facts, structured data, answer-ready content and consistent listings — and measure mention rates over time.' },
      { q: 'How do you track AI mentions?', a: 'For each tracked question we record whether the business is mentioned, its position, cited sources and sentiment, using official APIs where the provider allows it and logged manual checks by ROI staff otherwise. Every data point shows how and when it was collected.' },
      { q: 'Does this replace SEO?', a: 'It builds on it. AI search reads the same web, so technical SEO, local listings and structured data matter even more. AI Visibility focuses on the parts AI assistants rely on most.' },
    ],
    cost: { computeSecondsExpected: 120, emailMillicents: 100, supportAllowanceCents: 300, refundAllowanceBps: 200 },
    workflow: ['audit-crawl', 'score', 'fix-plan', 'implement', 'track-questions', 'monthly-report'],
  },
  {
    number: 1, slug: 'animated-gif-logo', name: 'Animated GIF Logo', category: 'branding',
    tagline: 'Turn your logo into a smooth looping animation — free 10-second reveal video included.',
    shortDescription: 'Upload your logo, pick an animation style, preview it free, and get a 1080p GIF, an email-ready GIF and an MP4 reveal.',
    longDescription:
      'Your logo, in motion. Choose from shine sweep, pulse glow, draw-on reveal, particle assemble, glitch-in, 3D flip and more. You see a free watermarked preview before paying. After purchase you receive a 1920×1080 master GIF, an email-optimized GIF under 1 MB for signatures, a static PNG fallback and a 10-second 1080p MP4 logo reveal.',
    answerFirst:
      'ROI’s Animated GIF Logo turns an uploaded PNG or JPG logo into a seamless looping animation. You preview it free with a watermark, then pay $21 to download a 1920×1080 master GIF, an email-optimized GIF under 1 MB, a transparent PNG fallback and a free 10-second 1080p MP4 reveal video.',
    kind: 'ONE_TIME', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'r2', 'resend', 'worker'], taxCode: 'txcd_10000000',
    plans: [{ slug: 'standard', name: 'Animated GIF Logo', amountCents: 2100, interval: 'ONE_TIME', isDefault: true, features: ['1920×1080 master GIF', 'Email GIF ≤ 1 MB', 'PNG fallback', 'Free 10 s 1080p reveal MP4'] }],
    faq: [
      { q: 'Will the GIF work in Gmail signatures?', a: 'Yes. We host the email GIF on a permanent HTTPS URL and show you the exact steps: Settings → Signature → Insert image → Web address (URL). Some Outlook versions show only the first frame, so the first frame always shows your full logo.' },
      { q: 'What files do I need?', a: 'A PNG, JPG or JPEG up to 10 MB with the shortest side at least 300 px. Transparent PNGs give the best results.' },
      { q: 'What if rendering fails?', a: 'We retry automatically, then a manager steps in. If it still fails within 24 hours you are refunded in full automatically.' },
    ],
    cost: { computeSecondsExpected: 90, storageMillicents: 300, emailMillicents: 100, supportAllowanceCents: 50, refundAllowanceBps: 300 },
    workflow: ['validate', 'prepare', 'preview', 'render', 'encode', 'qc', 'store', 'deliver'],
  },
  {
    number: 2, slug: 'logo-revival', name: 'Logo Revival', category: 'branding',
    tagline: 'Rescue a blurry, low-resolution logo.',
    shortDescription: 'Upload an old or tiny logo; see a free 10-second watermarked preview of the revived version; pay $9 for clean files.',
    longDescription:
      'Logo Revival denoises, upscales 4×, sharpens edges and cleans colors of low-resolution logos, with optional background removal and — for flat-color logos that pass a quality check — a traced vector. It is an enhanced reconstruction, not a guaranteed copy of a lost original.',
    answerFirst:
      'Logo Revival restores low-resolution logos. ROI denoises, upscales four times, refines edges and cleans colors, then shows a free watermarked 10-second preview video. For $9 you download a clean enhanced PNG, a transparent PNG, a 1080p reveal video and, when quality checks pass for flat logos, a traced SVG vector.',
    kind: 'ONE_TIME', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'r2', 'resend', 'worker'], taxCode: 'txcd_10000000',
    honesty: 'Results are an enhanced reconstruction and may differ from a lost original file.',
    plans: [{ slug: 'standard', name: 'Logo Revival', amountCents: 900, interval: 'ONE_TIME', isDefault: true, features: ['4× enhanced PNG', 'Transparent PNG', '1080p reveal MP4', 'Traced SVG when quality allows'] }],
    faq: [
      { q: 'How small can my logo be?', a: 'Down to 64 px on the shortest side, though larger sources give better results.' },
      { q: 'Do I always get a vector?', a: 'Only for flat-color logos whose traced version matches the enhanced image closely. We never ship a vector that does not pass the check.' },
    ],
    cost: { computeSecondsExpected: 120, storageMillicents: 300, emailMillicents: 100, supportAllowanceCents: 50, refundAllowanceBps: 400 },
    workflow: ['validate', 'classify', 'enhance', 'trace', 'quality', 'video', 'deliver'],
  },
  {
    number: 3, slug: 'logo-generator', name: 'Unique Logo Generator', category: 'branding',
    tagline: 'Three original concepts, similarity-screened, in minutes.',
    shortDescription: 'Describe your business; ROI’s vector engine creates three original logo concepts. Pick one and a package.',
    longDescription:
      'Our procedural vector engine builds real SVG logos from geometry, industry motifs and open-licensed typography, then screens every concept against all logos ROI has ever generated or sold and against a reference set. Purchased marks are reserved forever and never reissued.',
    answerFirst:
      'ROI’s Unique Logo Generator creates three original vector logo concepts from your company name, industry, colors and style. Each concept is similarity-screened against every logo ROI has generated or sold. Choose one and a package — Basic $24, Professional $37 or Premium $51 — and receive clean, unwatermarked files by email and in your dashboard.',
    kind: 'ONE_TIME', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'r2', 'resend'], taxCode: 'txcd_10000000',
    honesty: 'Concepts are similarity-screened, not trademark-cleared. Check the USPTO database or an attorney before registering a mark.',
    plans: [
      { slug: 'basic', name: 'Basic', amountCents: 2400, interval: 'ONE_TIME', features: ['3000 px PNG (transparent + white)', 'JPG'] },
      { slug: 'professional', name: 'Professional', amountCents: 3700, interval: 'ONE_TIME', isDefault: true, features: ['Everything in Basic', 'SVG vector', 'One-color, black & white variants', 'Favicon & social avatar sets'] },
      { slug: 'premium', name: 'Premium', amountCents: 5100, interval: 'ONE_TIME', features: ['Everything in Professional', 'Brand-kit PDF', 'Social banners', 'Business-card PDF', '2 revision rounds', 'Extended similarity report'] },
    ],
    faq: [
      { q: 'Is my logo guaranteed to be unique?', a: 'No logo tool can promise that. Every concept is similarity-screened against all ROI logos and a reference set, purchased marks are reserved forever, and the report shows exactly what was checked.' },
      { q: 'Can I download the previews?', a: 'Previews are low-resolution with a watermark baked into the pixels. Clean files are delivered only after purchase.' },
    ],
    cost: { computeSecondsExpected: 40, storageMillicents: 200, emailMillicents: 100, supportAllowanceCents: 80, refundAllowanceBps: 300 },
    workflow: ['form', 'generate', 'fingerprint', 'screen', 'preview', 'choose', 'package', 'deliver'],
  },
  {
    number: 4, slug: 'ebook-library', name: 'E-Book Library', category: 'library',
    tagline: 'Business, leadership and growth books — read the first pages free.',
    shortDescription: 'Browse the catalog, read the first three pages of Chapter 1 free, and buy the full book as a PDF.',
    longDescription:
      'A curated library on motivation, success, business, finance, leadership, marketing and productivity. Preview pages are free. Purchases are delivered by email and stay in your library with a personal, buyer-stamped copy.',
    answerFirst:
      'ROI’s E-Book Library sells business, leadership, marketing and self-improvement books. Anyone can read the first three pages of Chapter 1 free. After purchase the full PDF is emailed to you and saved in your ROI library, stamped with your name and order for personal use, with a download history.',
    kind: 'PER_ITEM', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'r2', 'resend'], taxCode: 'txcd_10302000',
    plans: [{ slug: 'per-book', name: 'Priced per book', amountCents: null, interval: 'ONE_TIME', isDefault: true, features: ['Free 3-page preview', 'PDF by email', 'Personal library'] }],
    faq: [{ q: 'Can I share my copy?', a: 'Copies are for personal use and stamped with the buyer’s name and order ID.' }],
    cost: { emailMillicents: 100, storageMillicents: 100, supportAllowanceCents: 20, refundAllowanceBps: 200 },
    workflow: ['upload', 'validate', 'preview-pages', 'catalog', 'purchase', 'stamp', 'deliver'],
  },
  {
    number: 5, slug: 'landing-page-hosting', name: 'Instant Landing Page + Hosting', category: 'websites',
    tagline: 'A professional website, previewed in seconds, hosted and managed.',
    shortDescription: 'Enter your business details, see your site live in about five seconds, choose a domain and publish.',
    longDescription:
      'Industry-specific copy, fast static pages, local SEO structure, contact form with spam protection, SSL and uptime monitoring. Manage every section from your dashboard with version history and one-click rollback. Domains under $15/year are included while you subscribe.',
    answerFirst:
      'ROI’s Instant Landing Page + Hosting builds a fast, mobile-friendly business website from your details and shows a live preview in about five seconds. For $32 a month ROI hosts it with SSL, uptime monitoring, a lead inbox and version history. Domains whose yearly price is under $15 are included; pricier domains are paid by you.',
    kind: 'SUBSCRIPTION', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'cloudflare', 'registrar', 'resend'], taxCode: 'txcd_10103000',
    plans: [{ slug: 'monthly', name: 'Website + Hosting', amountCents: 3200, interval: 'MONTH', isDefault: true, features: ['Live preview in ~5 s', 'Hosting, SSL, uptime checks', 'Lead inbox', 'Version history & rollback', 'Domain included if under $15/yr'] }],
    faq: [
      { q: 'Is the domain free?', a: 'If the domain’s yearly price (the higher of first-year and renewal) is under $15.00, ROI pays for it while your subscription is active. At $15.00 or more you pay the full price at registration and each renewal.' },
      { q: 'What happens if a payment fails?', a: 'You have a 7-day grace period. After that the site shows a placeholder; your data is kept for 90 days and you can export it.' },
    ],
    cost: { computeSecondsExpected: 30, storageMillicents: 500, domainCostCents: 1100, emailMillicents: 100, supportAllowanceCents: 200, refundAllowanceBps: 200 },
    workflow: ['form', 'generate', 'preview', 'domain', 'pay', 'build', 'deploy', 'dns', 'ssl', 'live'],
  },
  {
    number: 6, slug: 'managed-seo', name: 'Managed SEO', category: 'growth',
    tagline: 'Technical SEO audits, fixes and monthly reports.',
    shortDescription: '$19/month with an ROI website (auto-applied fixes) or $35/month for a site hosted elsewhere.',
    longDescription:
      'A safe crawler audits titles, metadata, links, structured data, speed and mobile usability. On ROI-hosted sites, safe fixes are applied automatically with a change log and rollback. Keyword data is labeled measured (Google Search Console) or estimated.',
    answerFirst:
      'ROI’s Managed SEO audits your website monthly for technical, content and speed issues, ranks fixes by impact and effort, and applies safe fixes automatically on ROI-hosted sites with one-click rollback. It costs $19 a month with an ROI website or $35 for sites hosted elsewhere. Rankings are never guaranteed.',
    kind: 'SUBSCRIPTION', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'resend', 'worker'], taxCode: 'txcd_10103000',
    honesty: 'No ranking guarantees. Data is labeled measured or estimated.',
    plans: [
      { slug: 'with-roi-website', name: 'With an ROI website', amountCents: 1900, interval: 'MONTH', isDefault: true, features: ['Auto-applied safe fixes', 'Monthly PDF report', 'Keyword suggestions'] },
      { slug: 'standalone', name: 'Website hosted elsewhere', amountCents: 3500, interval: 'MONTH', features: ['Ownership-verified audits', 'Ready-to-paste fixes', 'Monthly PDF report'] },
    ],
    faq: [{ q: 'Why is it cheaper with an ROI website?', a: 'We can apply fixes directly and safely on sites we host, so the $19 plan requires an active ROI website subscription ($32 + $19 = $51/month).' }],
    cost: { computeSecondsExpected: 300, storageMillicents: 300, emailMillicents: 100, supportAllowanceCents: 150, refundAllowanceBps: 200 },
    workflow: ['verify-ownership', 'crawl', 'analyze', 'prioritize', 'auto-fix', 'report'],
  },
  {
    number: 7, slug: 'local-geo', name: 'GEO (Local) Optimization', category: 'growth',
    tagline: 'Be the obvious local choice in every city you serve.',
    shortDescription: '$11/month on ROI-hosted sites, $33/month for third-party sites: local pages, NAP checks, local schema.',
    longDescription:
      'Location pages with genuinely local content (only when they pass our uniqueness gate), LocalBusiness schema, name-address-phone consistency checks, a Google Business Profile checklist and monthly local-visibility reports.',
    answerFirst:
      'ROI’s GEO (local) optimization helps nearby customers and AI search find your business in the areas you actually serve. It builds unique location pages, local schema and consistent name-address-phone details, and reports local visibility monthly. It costs $11 a month on ROI-hosted sites or $33 for sites hosted elsewhere.',
    kind: 'SUBSCRIPTION', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'resend'], taxCode: 'txcd_10103000',
    plans: [
      { slug: 'roi-hosted', name: 'ROI-hosted site', amountCents: 1100, interval: 'MONTH', isDefault: true, features: ['Auto-published local pages', 'Local schema', 'NAP checks'] },
      { slug: 'third-party', name: 'Site hosted elsewhere', amountCents: 3300, interval: 'MONTH', features: ['Local page files + instructions', 'Local schema snippets', 'NAP checks'] },
    ],
    faq: [{ q: 'Will you create pages for cities I do not serve?', a: 'No. You attest to your service areas, pages must pass a uniqueness gate, and there is a monthly page cap to prevent doorway pages.' }],
    cost: { computeSecondsExpected: 120, emailMillicents: 100, supportAllowanceCents: 100, refundAllowanceBps: 200 },
    workflow: ['service-areas', 'keywords', 'pages', 'quality-gate', 'schema', 'nap', 'report'],
  },
  {
    number: 8, slug: 'email-signature-suite', name: 'Email Signature Suite', category: 'branding',
    tagline: 'Matching branded signatures for your whole team.',
    shortDescription: 'Add employees (or import CSV), pick a template, include your animated logo, and download every signature.',
    longDescription:
      'Ten table-based templates tested for Gmail, Outlook, Apple Mail and Thunderbird, dark-mode safe and mobile-friendly. Copy-to-clipboard gallery, HTML and plain-text files, and install guides. Your Animated GIF Logo is detected automatically.',
    answerFirst:
      'ROI’s Email Signature Suite creates matching, professional email signatures for up to 50 employees for a one-time $12. Add people manually or by CSV, choose one of ten tested templates, include your animated GIF logo, and download HTML, plain-text and a copy-to-clipboard gallery with install guides for Gmail, Outlook and Apple Mail.',
    kind: 'ONE_TIME', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'r2', 'resend'], taxCode: 'txcd_10000000',
    plans: [{ slug: 'standard', name: 'Email Signature Suite', amountCents: 1200, interval: 'ONE_TIME', isDefault: true, features: ['Up to 50 employees', '10 tested templates', 'HTML + plain text + ZIP', 'Copy-to-clipboard gallery', 'Hosted images ≥ 24 months'] }],
    faq: [{ q: 'Does it work in Outlook?', a: 'Yes. Templates use tables and inline CSS for Outlook’s Word-based renderer; animated GIFs show their first frame in some Outlook versions, so the first frame always shows your full logo.' }],
    cost: { computeSecondsExpected: 10, storageMillicents: 200, emailMillicents: 100, supportAllowanceCents: 50, refundAllowanceBps: 200 },
    workflow: ['company', 'employees', 'template', 'preview', 'pay', 'generate', 'zip', 'deliver'],
  },
  {
    number: 10, slug: 'ai-business-integration', name: 'AI Business Growth Integration', category: 'ai',
    tagline: 'Your own AI assistant, trained on your business.',
    shortDescription: 'A website chatbot trained on your content, plus automations around your own ChatGPT, Claude or Gemini account.',
    longDescription:
      'Part A is ROI’s built-in business assistant — no external API — that answers from your FAQs, services and policies, captures leads and hands off to a human. Part B connects your own AI provider account with your own key and spending limits for reply drafts, review responses and weekly digests. Custom quote plus a monthly management fee.',
    answerFirst:
      'ROI’s AI Business Growth Integration gives your business a website assistant trained only on your own content, built into ROI with no external AI fees, plus optional automations using your own ChatGPT, Claude or Gemini account and key. Pricing is a custom quote plus a monthly management fee, agreed before any work starts.',
    kind: 'QUOTE', deliveryMode: 'MANAGED', requiredIntegrations: ['stripe', 'resend'], taxCode: 'txcd_10103000',
    plans: [{ slug: 'custom', name: 'Custom quote', amountCents: null, interval: 'MONTH', isDefault: true, features: ['Website assistant on your content', 'Lead capture & human handoff', 'Bring-your-own AI key automations', 'PII redaction & kill switches'] }],
    faq: [{ q: 'Who pays for ChatGPT or Claude usage?', a: 'You do, through your own provider account and key, with limits you set. ROI never pays for or marks up those calls, and the built-in assistant needs no external AI at all.' }],
    cost: { supportAllowanceCents: 1000 },
    workflow: ['request-quote', 'scope', 'invoice', 'onboarding', 'knowledge-upload', 'test', 'go-live'],
  },
];

export const CATEGORIES = [
  { slug: 'ai', name: 'AI & Visibility', sortOrder: 1 },
  { slug: 'websites', name: 'Websites & Hosting', sortOrder: 3 },
  { slug: 'growth', name: 'SEO & Local', sortOrder: 4 },
  { slug: 'branding', name: 'Branding', sortOrder: 5 },
  { slug: 'library', name: 'Library', sortOrder: 6 },
] as const;

/**
 * Owner decision 2026-11-06 (DECISIONS D-21): Social Media Autopilot (Product 9) moves to a second phase. It is not
 * seeded, sold, shown or linked. The definition is kept here so phase 2 can move it back into CATALOG.
 */
export const PHASE_2_PRODUCTS: SeedProduct[] = [
  {
    number: 9, slug: 'social-autopilot', name: 'Social Media Autopilot', category: 'social',
    tagline: 'Connect Instagram, TikTok, Facebook and X once. ROI posts for you.',
    shortDescription: 'ROI studies your market, plans the calendar, creates on-brand posts, publishes at the best times and shows results live.',
    longDescription:
      'Link your accounts with one click each. ROI learns from your own post history and your industry’s benchmarks, builds a 30-day calendar, generates branded images and captions, and publishes on autopilot — or asks you first, if you prefer. Your command center shows exactly when ROI posted and how each post is performing, with the age of every number.',
    answerFirst:
      'Social Media Autopilot connects your Instagram, TikTok, Facebook and X accounts once, then ROI plans, creates and publishes posts for you. It learns which formats, times and topics earn engagement for your account and industry, and shows live results with clear data ages. You can switch to approve-first or pause at any time.',
    kind: 'SUBSCRIPTION', deliveryMode: 'AUTOMATED', requiredIntegrations: ['stripe', 'meta', 'tiktok', 'x', 'r2', 'worker'], taxCode: 'txcd_10103000',
    honesty: 'ROI optimizes for engagement but never promises specific results. Platform data arrives with delays; every metric shows its source and age.',
    plans: [
      { slug: 'starter', name: 'Starter', amountCents: 4900, interval: 'MONTH', published: false, features: ['12 posts / month', '2 platforms', 'Approve-first or Autopilot'] },
      { slug: 'growth', name: 'Growth', amountCents: 9900, interval: 'MONTH', isDefault: true, published: false, features: ['30 posts / month', 'All 4 platforms', 'Best-time learning', 'Live command center'] },
      { slug: 'pro', name: 'Pro', amountCents: 19900, interval: 'MONTH', published: false, features: ['60 posts / month', 'All 4 platforms', 'Manager review option', 'Monthly strategy report'] },
    ],
    faq: [
      { q: 'Do I ever have to post again?', a: 'Not if you choose Full Autopilot. ROI plans, creates and publishes on its own after you record your consent. You can switch to approve-first, pause or stop at any time.' },
      { q: 'Does ROI like, follow or comment on my behalf?', a: 'No. ROI only publishes your posts and reads their metrics through each platform’s official API. It never automates likes, follows or comments.' },
      { q: 'How “live” is the engagement data?', a: 'Facebook and Instagram can push updates; other platforms are checked on a short schedule. Every number shows where it came from and how old it is.' },
    ],
    cost: { computeSecondsExpected: 600, storageMillicents: 2000, socialApiMillicentsPerPost: 20_000, postsPerPeriod: 30, supportAllowanceCents: 500, refundAllowanceBps: 300 },
    workflow: ['connect-accounts', 'brand-kit', 'choose-mode', 'plan-calendar', 'generate', 'approve-or-autopilot', 'publish', 'measure', 'learn'],
  },
];
