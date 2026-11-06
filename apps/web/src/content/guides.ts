/** Guides written for people first (spec §7.1 AEO): direct answer, question headings, real steps. */
export type Guide = { slug: string; title: string; description: string; answer: string; updated: string; sections: Array<{ h: string; body: string[] }>; howTo?: string[] };

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-get-recommended-by-chatgpt',
    title: 'How to get your business recommended by ChatGPT and AI search',
    description: 'What AI assistants look for before they mention a local business, and the practical steps to make your business easy to understand and cite.',
    answer: 'AI assistants recommend businesses they can identify with confidence. Make your name, address, phone and services identical everywhere; add LocalBusiness and FAQ structured data; open key pages with a plain 40–60-word answer; let AI crawlers read your public pages; and keep genuine, recent reviews on well-known listings. Then track real customer questions monthly.',
    updated: '2026-11-06',
    sections: [
      { h: 'Why do AI assistants recommend some businesses and not others?', body: ['Assistants such as ChatGPT, Gemini, Claude and Perplexity combine what they learned in training with what they can retrieve from the web at answer time. When they recommend a business, they need to be confident it exists, what it does, where it operates and that others speak well of it.', 'Businesses with inconsistent names, missing addresses, thin pages and few third-party mentions are simply harder to trust — so they are mentioned less.'] },
      { h: 'Step 1: Can AI crawlers read your site?', body: ['Check robots.txt. Many sites accidentally block crawlers such as GPTBot, ClaudeBot or PerplexityBot. Allow them on public marketing pages while keeping private areas blocked. Publishing an /llms.txt file that summarizes who you are and links your key pages is a low-effort extra.'] },
      { h: 'Step 2: Make your business an unambiguous entity', body: ['Use exactly the same business name, address and phone number on your website, Google Business Profile, Apple and Bing listings, Yelp and industry directories. Add Organization or LocalBusiness structured data (JSON-LD) with sameAs links to those profiles.'] },
      { h: 'Step 3: Write answer-ready pages', body: ['Start important pages with a direct answer of 40–60 words: who you are, what you do, for whom and where. Use headings phrased as real customer questions and answer each one plainly. Short comparison or “what’s included” tables are easy for AI systems to quote.'] },
      { h: 'Step 4: Earn genuine reputation signals', body: ['Ask happy customers for reviews on the platforms they already use. Never buy or invent reviews — it violates platform rules and the law, and it damages trust.'] },
      { h: 'How do you know it is working?', body: ['Write down 10–50 questions your customers actually ask, such as “best family dentist in Tampa”. Check them monthly across engines and record whether you are mentioned, in what position, and which sources were cited. ROI’s AI Visibility service automates this where providers allow it and logs manual checks where they do not.'] },
    ],
    howTo: ['Allow AI crawlers in robots.txt and publish /llms.txt', 'Make name, address and phone identical everywhere', 'Add LocalBusiness and FAQPage JSON-LD with sameAs', 'Open key pages with a 40–60-word direct answer', 'Collect genuine reviews on major listings', 'Track real customer questions monthly'],
  },
  {
    slug: 'add-animated-gif-logo-to-gmail-signature',
    title: 'How to add an animated GIF logo to your Gmail signature',
    description: 'Step-by-step instructions to insert an animated logo into a Gmail signature using a hosted image URL, plus tips for Outlook.',
    answer: 'In Gmail, open Settings → See all settings → General → Signature, create or edit a signature, click the Insert image icon, choose “Web address (URL)” and paste the HTTPS link to your hosted GIF. Keep the GIF under 1 MB and make sure its first frame shows your full logo, because some Outlook versions show only the first frame.',
    updated: '2026-11-06',
    sections: [
      { h: 'What you need', body: ['An animated GIF hosted on a permanent HTTPS address. Uploading the file directly into Gmail often converts it or breaks the animation; a hosted URL keeps it animated. ROI’s Animated GIF Logo includes an email-optimized GIF (under 1 MB) on a permanent link for exactly this.'] },
      { h: 'Why does Outlook show a still image?', body: ['Several desktop versions of Outlook display only the first frame of a GIF. That is why the first frame should always show your complete logo.'] },
      { h: 'How big should the GIF be?', body: ['Aim for 300–600 pixels wide and under 1 MB. Larger files load slowly and may be clipped by some email clients.'] },
    ],
    howTo: ['Open Gmail Settings → See all settings', 'Under General, find Signature and create or edit one', 'Click the Insert image icon in the signature editor', 'Choose “Web address (URL)” and paste your GIF’s HTTPS link', 'Resize if needed and click Save Changes at the bottom'],
  },
  {
    slug: 'domain-pricing-under-15-explained',
    title: 'Domain pricing explained: why “under $15” matters',
    description: 'How first-year and renewal prices work for domains, and how ROI decides when a domain is included with your website.',
    answer: 'Many domains are cheap in the first year and more expensive at renewal. ROI looks at the higher of the two prices. If that yearly price is under $15.00, ROI pays for the domain while your website subscription is active. If it is $15.00 or more, you pay the full price at registration and at every annual renewal — and you always own the domain.',
    updated: '2026-11-06',
    sections: [
      { h: 'Why look at the renewal price?', body: ['A domain advertised for a few dollars can renew at three or four times that. Using the higher price avoids surprises in year two.'] },
      { h: 'Who owns the domain?', body: ['You do. ROI registers it with you as the legal registrant and manages DNS for you. You can transfer it away at any time.'] },
      { h: 'What if my subscription ends?', body: ['You get 30 days to pay the renewal yourself or transfer the domain out. If a covered domain’s renewal price later rises to $15 or more, ROI notifies you 60 days ahead.'] },
    ],
  },
];
