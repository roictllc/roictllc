/**
 * Legal page templates (spec §16): stored in the database (legal_documents), editable by the admin,
 * and marked "attorney review recommended". Plain Markdown-like text: "## " headings, blank-line paragraphs, "- " bullets.
 */
export const LEGAL_DOCS: Array<{ slug: string; title: string; body: string }> = [
  {
    slug: 'privacy', title: 'Privacy Policy',
    body: `Effective date: November 6, 2026

ROI LLC ("ROI", "we") provides marketing, website, branding and automation services to businesses in the United States through roictllc.com. This policy explains what personal information we collect, why, and the choices you have, including rights under the California Consumer Privacy Act as amended by the CPRA ("CCPA") and similar state laws.

## Information we collect
- Account information: name, business name, email address, password (stored only as a salted Argon2id hash), and two-factor settings.
- Business information you provide: logos, brand colors, addresses, service areas, employee details for email signatures, website content and photos.
- Payment information: payments are processed by Stripe. ROI never receives or stores full card numbers.
- Connected accounts: when you connect Instagram, Facebook, TikTok or X, we store access tokens encrypted (AES-256-GCM) and the post and engagement data the platform's API provides.
- Usage and device data: IP address, browser type, pages viewed and security logs (sign-ins, rate limits).
- Communications: messages to support, contact forms, and email engagement for marketing messages you opted into.

## How we use information
- To provide, operate and improve the services you purchase, including generating deliverables and publishing posts you authorized.
- To process payments, prevent fraud and abuse, and keep accounts secure.
- To send transactional emails (receipts, deliveries, security notices) and, with your consent, marketing emails you can unsubscribe from at any time.
- To comply with law and enforce our Terms.

## AI features
ROI's built-in assistant and generators run on ROI's own systems. If you connect your own third-party AI provider account (Product 10), content you choose to send is transmitted to that provider under your account and their terms; ROI redacts common personal identifiers first and logs what was sent.

## Sharing
We share information only with service providers that help us run ROI (for example hosting, database, email delivery, payments, storage, domain registration and the social platforms you connect), with your direction, or when required by law. We do not sell personal information and do not share it for cross-context behavioral advertising.

## Retention
We keep information while your account is active and as needed for the purposes above. Suspended website data is kept for 90 days unless you ask us to delete it sooner. Security logs and financial records are retained as required by law.

## Your rights
Depending on your state, you may have the right to know, access, correct, delete and port your personal information, and to opt out of sale or sharing (we do neither). Use Settings → Privacy in your dashboard to export or delete your data, or email roictllc@gmail.com. We will not discriminate against you for exercising your rights. Authorized agents may submit requests with written permission.

## Security
We use encryption in transit and at rest for sensitive fields, mandatory two-factor authentication for staff, least-privilege access and audit logging. No system is perfectly secure; please use a strong unique password.

## Children
ROI is for businesses and is not directed to children under 16.

## Contact
ROI LLC · roictllc@gmail.com`,
  },
  {
    slug: 'terms', title: 'Terms of Service',
    body: `Effective date: November 6, 2026

These Terms govern your use of ROI's website, dashboards and services provided by ROI LLC. By creating an account or purchasing, you agree to them on behalf of yourself and the business you represent.

## Accounts
You must provide accurate information, keep credentials secure and be at least 18. You are responsible for activity under your account.

## Services and deliverables
ROI provides digital products (such as animated logos, logo concepts, email signatures and e-books) and subscription services (such as website hosting, SEO, local optimization, social media automation and AI visibility). Automated products are delivered after payment and after passing quality checks.

## No guaranteed results
Search rankings, AI assistant recommendations, social engagement and revenue depend on factors outside ROI's control. ROI does not guarantee rankings, mentions, followers, leads or sales. Measured data is labeled with its source and age; estimates are labeled as estimates.

## Your content and rights
You keep ownership of content you upload. You grant ROI a license to use it solely to provide the services. You confirm you have the rights to logos, photos, testimonials and other material you provide. Testimonials must be genuine.

## Generated logos
On full payment, ROI assigns to you its rights in the purchased logo concept. Concepts are similarity-screened against ROI's own records and reference sets but are not trademark-cleared; you are responsible for any trademark search or registration.

## Social media automation
By enabling Autopilot you authorize ROI to publish posts to the accounts you connected without prior approval. You can switch to approve-first, pause or disconnect at any time. ROI never automates likes, follows or comments.

## Domains
You are the registrant of domains ROI registers for you. ROI pays the registration and renewals of domains whose yearly price (the higher of first-year and renewal) is under $15.00 while your qualifying subscription is active. Domains at $15.00 or more are paid in full by you at registration and each renewal. If your subscription ends, you have 30 days to pay the renewal or transfer the domain out.

## Payments, renewals and cancellations
Prices are shown before purchase. Subscriptions renew automatically until cancelled; you can cancel anytime from Billing and keep access until the end of the paid period. Failed payments have a 7-day grace period, after which hosted sites may be suspended. Refunds follow the Refund Policy.

## Acceptable use
You must follow the Acceptable Use Policy. We may suspend services that violate it or the law.

## Disclaimers and limitation of liability
Services are provided "as is" to the extent permitted by law. ROI's total liability for any claim is limited to the amounts you paid ROI in the 12 months before the claim. ROI is not liable for indirect or consequential damages.

## Changes and contact
We may update these Terms with notice. Questions: roictllc@gmail.com.`,
  },
  {
    slug: 'refund-policy', title: 'Refund Policy',
    body: `Effective date: November 6, 2026

## Digital products
Digital goods (animated logos, logo packages, email signature suites, e-books) begin delivery immediately after payment, and you agree to that at checkout. Delivered and downloaded files are final unless they are defective.

## Automatic refunds for failed automation
If an automated product (Animated GIF Logo, Logo Revival or Unique Logo Generator) fails our quality checks and a manager cannot resolve it within 24 hours, ROI refunds you in full automatically.

## Subscriptions
You can cancel anytime; service continues until the end of the paid period. Website subscriptions can be refunded within 14 days of purchase if the website was never published.

## Domains
Domain registration fees are not refundable once the domain is registered.

## How to request
Open a ticket in your dashboard (Support) or email roictllc@gmail.com with your order number.`,
  },
  {
    slug: 'acceptable-use', title: 'Acceptable Use Policy',
    body: `You may not use ROI to create, publish or host content that is illegal, infringing, deceptive, hateful, harassing, sexually explicit, or malicious; that impersonates another person or brand; that makes medical, legal or financial guarantees; that includes fake reviews or testimonials; or that sends spam. Generated websites and social posts pass automated policy scans and may be held for human review. Repeat or serious violations lead to suspension. Report abuse to roictllc@gmail.com.`,
  },
  {
    slug: 'takedown', title: 'Content & Takedown Policy (DMCA)',
    body: `ROI respects intellectual property rights and responds to notices under the Digital Millennium Copyright Act (17 U.S.C. § 512).

## Submitting a notice
Use the form on this page. A valid notice includes your contact information, identification of the copyrighted work, the URL of the material, a good-faith statement, a statement that the information is accurate and that you are authorized to act, and your signature.

## Counter-notices
If your content was removed by mistake, you may submit a counter-notice through the same form. We forward it to the original claimant and may restore the material in 10–14 business days unless the claimant files a court action.

## Repeat infringers
ROI terminates accounts of repeat infringers in appropriate circumstances.

## Designated agent
ROI LLC's designated DMCA agent registration with the U.S. Copyright Office is pending; until then, send notices to roictllc@gmail.com.`,
  },
  {
    slug: 'cookies', title: 'Cookie Notice',
    body: `ROI uses only essential cookies: a session cookie that keeps you signed in, a security token that protects forms from cross-site request forgery, and a short-lived cookie that shows two-factor recovery codes once. We do not use advertising cookies or third-party trackers. Our analytics are first-party and cookie-less where possible.`,
  },
];
