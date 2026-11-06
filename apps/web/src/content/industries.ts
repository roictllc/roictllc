/** Industry pages — each written with genuinely distinct content (spec §7.1 quality gate; no doorway pages). */
export const INDUSTRIES = [
  {
    slug: 'dentists', name: 'dentists', title: 'Marketing for dental practices — AI visibility, website & social', description: 'Help new patients find your practice when they ask ChatGPT or Google for a dentist: accurate practice data, insurance and hours, answer-ready pages and social posts that build trust.',
    headline: 'More new patients, from search, maps and AI assistants.',
    answer: 'Patients increasingly ask AI assistants which dentist near them takes new patients, accepts their insurance or offers weekend hours. ROI makes those facts unambiguous across your website and listings with Dentist schema, insurance and hours in plain text, answer-ready FAQ pages and a steady stream of educational posts — without medical claims or invented reviews.',
    steps: [['Practice facts', 'Insurance accepted, hours, emergencies, new-patient policy, languages — consistent everywhere.'], ['Dentist schema', 'Dentist structured data with services, areas and sameAs links to your listings.'], ['Answer pages', '“How much is a cleaning?”, “Do you see kids?” — answered plainly.'], ['Patient-friendly posts', 'Hygiene tips and office updates on autopilot, reviewed for health-claim safety.']] as Array<[string, string]>,
    products: ['ai-visibility', 'landing-page-hosting', 'social-autopilot', 'local-geo'],
    faq: [{ q: 'Do you write medical advice?', a: 'No. Content is educational and general, and our filters block treatment promises or medical claims.' }, { q: 'Can you show our insurance plans?', a: 'Yes — as plain text and in structured data, which helps both patients and AI assistants answer “does this dentist take my insurance?”.' }],
  },
  {
    slug: 'construction', name: 'construction companies', title: 'Marketing for contractors & construction companies', description: 'Win more bids with a credible website, licensed-and-insured facts that AI assistants can verify, project photos and local pages for the areas you really serve.',
    headline: 'Look like the safest choice before the first call.',
    answer: 'Homeowners and property managers want proof: licenses, insurance, service areas, project photos and how quickly you respond. ROI publishes these facts clearly on a fast website with GeneralContractor schema, builds local pages only for the counties and cities you actually work in, and turns finished projects into before-and-after posts on autopilot.',
    steps: [['Credentials up front', 'License numbers, insurance, warranties and bonding stated clearly.'], ['Service-area pages', 'Only for areas you serve, with real local project details.'], ['Project showcase', 'Before/after photos auto-cropped and branded for social.'], ['Fast lead response', 'Contact form leads land in your inbox and dashboard instantly.']] as Array<[string, string]>,
    products: ['landing-page-hosting', 'local-geo', 'social-autopilot', 'ai-visibility'],
    faq: [{ q: 'Can you create pages for every nearby town?', a: 'Only where you genuinely work and only with distinct content. We cap pages per month to avoid low-quality doorway pages that hurt rankings.' }, { q: 'Do you need our license numbers?', a: 'If your state requires a license for your trade, showing it builds trust with customers and AI assistants alike.' }],
  },
  {
    slug: 'marketing-agencies', name: 'marketing agencies', title: 'ROI for marketing agencies — white-glove automation for your clients', description: 'Use ROI’s AI visibility audits, social autopilot and website engine to deliver more for each client, with clear data sources you can show in reports.',
    headline: 'Deliver more for every client — with data you can defend.',
    answer: 'Agencies use ROI to scale the repetitive parts of client work: AI visibility audits that make a strong first meeting, social posting on autopilot with approval workflows, fast websites with rollback, and monthly reports where every number shows its source and age. Your team keeps strategy and relationships; ROI handles production.',
    steps: [['Audit prospects', 'Run a free AI Visibility audit and share the report link.'], ['Onboard clients', 'One workspace per client with isolated data.'], ['Approve or automate', 'Manager-review mode lets your team approve every post.'], ['Report with confidence', 'Measured vs. estimated data clearly labeled.']] as Array<[string, string]>,
    products: ['ai-visibility', 'social-autopilot', 'landing-page-hosting', 'managed-seo'],
    faq: [{ q: 'Is client data separated?', a: 'Yes. Every client has its own workspace, and isolation is enforced in the database layer and covered by automated tests.' }, { q: 'Can we refer clients?', a: 'Yes — ROI’s affiliate program tracks referrals and pays commissions after the refund window.' }],
  },
];
