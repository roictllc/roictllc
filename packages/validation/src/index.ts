import { z } from 'zod';

/**
 * Schema-driven product forms (spec §11-3): one definition drives the client form (fields[]) and server validation (zod).
 * Uploaded files are referenced by CustomerAsset id after the upload pipeline validated and scanned them.
 */
export type FieldDef =
  | { name: string; label: string; type: 'text' | 'email' | 'tel' | 'url' | 'textarea'; required?: boolean; min?: number; max?: number; help?: string; placeholder?: string }
  | { name: string; label: string; type: 'select' | 'radio'; options: Array<{ value: string; label: string }>; required?: boolean; help?: string }
  | { name: string; label: string; type: 'color-list'; min: number; max: number; required?: boolean; help?: string }
  | { name: string; label: string; type: 'file'; accept: string[]; maxBytes: number; minSide?: number; maxPixels?: number; required?: boolean; help?: string }
  | { name: string; label: string; type: 'checkbox'; required?: boolean; help?: string }
  | { name: string; label: string; type: 'repeat'; fields: FieldDef[]; min?: number; max?: number; help?: string };

export const ANIMATION_STYLES = [
  'shine-sweep', 'pulse-glow', 'float', 'draw-on', 'particle-assemble', 'glitch-in', 'spotlight', '3d-flip', 'ripple', 'neon-outline',
] as const;
export const LOGO_CATEGORIES = [
  'marketing', 'dentist', 'construction', 'real-estate', 'law', 'restaurant', 'fitness', 'salon', 'auto-repair', 'plumbing', 'hvac',
  'roofing', 'landscaping', 'cleaning', 'accounting', 'medical', 'tech', 'e-commerce', 'education', 'nonprofit', 'photography', 'other',
] as const;
export const LOGO_STYLES = ['modern', 'classic', 'playful', 'bold', 'minimal', 'elegant'] as const;
export const INDUSTRIES = [
  'dentist', 'construction', 'plumbing', 'hvac', 'roofing', 'electrician', 'landscaping', 'cleaning', 'auto-repair', 'real-estate', 'law',
  'accounting', 'restaurant', 'salon', 'fitness', 'medical', 'chiropractor', 'veterinary', 'marketing-agency', 'photography', 'pest-control', 'moving',
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #00E5FF');
const assetId = z.string().min(10).max(40);
const opt = (s: z.ZodString) => s.optional().or(z.literal('').transform(() => undefined));
const usPhone = z.string().regex(/^[+()\d\s.-]{7,20}$/, 'Enter a valid phone number');

export const schemas = {
  'animated-gif-logo': z.object({
    logoAssetId: assetId,
    style: z.enum(ANIMATION_STYLES),
    background: z.enum(['keep', 'transparent', 'solid']),
    backgroundColor: hex.optional(),
    loopSpeed: z.enum(['slow', 'normal', 'fast']).default('normal'),
    tagline: opt(z.string().max(60)),
    effectColors: z.array(hex).max(3).default([]),
  }),
  'logo-revival': z.object({
    logoAssetId: assetId,
    output: z.enum(['transparent', 'white']),
    logoType: z.enum(['flat', 'photographic']),
    notes: opt(z.string().max(500)),
  }),
  'logo-generator': z.object({
    companyName: z.string().trim().min(2).max(60),
    tagline: opt(z.string().trim().max(80)),
    category: z.enum(LOGO_CATEGORIES),
    colors: z.array(hex).min(1).max(3),
    style: z.enum(LOGO_STYLES),
    avoid: opt(z.string().max(200)),
  }),
  'email-signature-suite': z.object({
    company: z.object({
      name: z.string().trim().min(1).max(80), website: opt(z.string().url().max(200)), address: opt(z.string().max(200)),
      logoAssetId: assetId.optional(), useAnimatedLogo: z.boolean().default(true), colors: z.array(hex).min(1).max(3),
      social: z.record(z.string(), z.string().url()).default({}), disclaimer: opt(z.string().max(600)),
      bannerText: opt(z.string().max(80)), bannerUrl: opt(z.string().url()),
    }),
    templateSlug: z.string().min(2).max(40),
    employees: z.array(z.object({
      name: z.string().trim().min(1).max(80), title: opt(z.string().max(80)), department: opt(z.string().max(80)),
      phone: usPhone.optional().or(z.literal('').transform(() => undefined)), mobile: usPhone.optional().or(z.literal('').transform(() => undefined)),
      email: z.string().email().max(120), photoAssetId: assetId.optional(), extraLink: opt(z.string().url().max(200)),
    })).min(1).max(50),
    utm: z.boolean().default(false),
  }),
  'landing-page-hosting': z.object({
    businessName: z.string().trim().min(2).max(80),
    industry: z.enum(INDUSTRIES),
    description: z.string().trim().min(20).max(800),
    tagline: opt(z.string().max(100)),
    logoAssetId: assetId.optional(),
    services: z.array(z.object({ name: z.string().min(2).max(60), description: z.string().min(10).max(400), priceCents: z.number().int().nonnegative().optional() })).min(1).max(12),
    phone: usPhone, email: z.string().email(), address: opt(z.string().max(160)), city: z.string().min(2).max(60), state: z.string().length(2),
    hours: opt(z.string().max(200)), serviceAreas: z.array(z.string().min(2).max(60)).max(30).default([]),
    colors: z.array(hex).min(1).max(3), design: z.enum(['aurora', 'classic', 'bold', 'clean', 'warm']).default('aurora'),
    ctaGoal: z.enum(['call', 'form', 'booking']).default('call'), bookingUrl: opt(z.string().url()),
    social: z.record(z.string(), z.string().url()).default({}),
    testimonials: z.array(z.object({ quote: z.string().min(10).max(400), author: z.string().min(2).max(60), attested: z.literal(true) })).max(6).default([]),
    licenses: opt(z.string().max(300)),
    serviceAreaAttestation: z.literal(true).optional(),
  }),
  'ai-visibility-audit': z.object({
    businessName: z.string().trim().min(2).max(80),
    url: z.string().url().max(300),
    city: z.string().trim().min(2).max(60),
    category: z.string().trim().min(2).max(60),
    email: z.string().email().max(160).optional().or(z.literal('').transform(() => undefined)),
    competitors: opt(z.string().max(300)),
  }),
  'ai-business-integration': z.object({
    businessName: z.string().trim().min(2).max(80), contactName: z.string().min(2).max(80), email: z.string().email(),
    goals: z.string().min(20).max(2000), toolsUsed: opt(z.string().max(500)), monthlyVolume: z.enum(['<100', '100-1000', '1000-10000', '>10000']),
  }),
  contact: z.object({
    name: z.string().trim().min(2).max(80), email: z.string().email().max(160), company: opt(z.string().max(120)),
    topic: z.enum(['sales', 'support', 'billing', 'partnership', 'press', 'other']), message: z.string().trim().min(10).max(4000),
  }),
  takedown: z.object({
    kind: z.enum(['DMCA_NOTICE', 'COUNTER_NOTICE']), claimantName: z.string().min(2).max(120), claimantEmail: z.string().email(),
    claimantAddress: z.string().min(10).max(300), url: z.string().url(), workDescription: z.string().min(10).max(2000),
    goodFaith: z.literal(true), accuracy: z.literal(true), signature: z.string().min(2).max(120),
  }),
};

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  businessName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(12).max(256),
  marketingOk: z.boolean().default(false),
  acceptTerms: z.literal(true),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(256) });
export const totpSchema = z.object({ code: z.string().regex(/^\d{6}$|^[a-z0-9]{4}-[a-z0-9]{4}$/i) });
export const priceEditSchema = z.object({
  planId: z.string().min(10),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  interval: z.enum(['ONE_TIME', 'MONTH', 'YEAR']),
  reason: z.string().trim().min(3).max(300),
  overrideReason: z.string().trim().max(300).optional(),
});

/** Field descriptors for the UI (rendered by apps/web/src/components/product-form.tsx). */
export const FORMS: Record<string, FieldDef[]> = {
  'animated-gif-logo': [
    { name: 'logoAssetId', label: 'Your logo', type: 'file', accept: ['image/png', 'image/jpeg'], maxBytes: 10 * 1024 * 1024, minSide: 300, maxPixels: 25_000_000, required: true, help: 'PNG, JPG or JPEG, up to 10 MB, shortest side ≥ 300 px.' },
    { name: 'style', label: 'Animation style', type: 'radio', required: true, options: ANIMATION_STYLES.map((s) => ({ value: s, label: s.replace(/-/g, ' ') })) },
    { name: 'background', label: 'Background', type: 'select', required: true, options: [{ value: 'keep', label: 'Keep original' }, { value: 'transparent', label: 'Make transparent' }, { value: 'solid', label: 'Solid color' }] },
    { name: 'loopSpeed', label: 'Loop speed', type: 'select', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] },
    { name: 'tagline', label: 'Tagline (optional)', type: 'text', max: 60 },
    { name: 'effectColors', label: 'Effect colors', type: 'color-list', min: 0, max: 3 },
  ],
  'logo-revival': [
    { name: 'logoAssetId', label: 'Low-resolution logo', type: 'file', accept: ['image/png', 'image/jpeg'], maxBytes: 10 * 1024 * 1024, minSide: 64, maxPixels: 25_000_000, required: true },
    { name: 'output', label: 'Output', type: 'radio', required: true, options: [{ value: 'transparent', label: 'Transparent background' }, { value: 'white', label: 'White background' }] },
    { name: 'logoType', label: 'Logo type', type: 'radio', required: true, options: [{ value: 'flat', label: 'Flat / graphic' }, { value: 'photographic', label: 'Photographic' }] },
    { name: 'notes', label: 'Text correction notes (optional)', type: 'textarea', max: 500 },
  ],
  'logo-generator': [
    { name: 'companyName', label: 'Company name', type: 'text', required: true, min: 2, max: 60 },
    { name: 'tagline', label: 'Tagline (optional)', type: 'text', max: 80 },
    { name: 'category', label: 'Industry', type: 'select', required: true, options: LOGO_CATEGORIES.map((c) => ({ value: c, label: c.replace(/-/g, ' ') })) },
    { name: 'colors', label: 'Preferred colors', type: 'color-list', min: 1, max: 3, required: true },
    { name: 'style', label: 'Style', type: 'radio', required: true, options: LOGO_STYLES.map((s) => ({ value: s, label: s })) },
    { name: 'avoid', label: 'Words or symbols to avoid (optional)', type: 'text', max: 200 },
  ],
  'ai-visibility-audit': [
    { name: 'businessName', label: 'Business name', type: 'text', required: true },
    { name: 'url', label: 'Website URL', type: 'url', required: true, placeholder: 'https://' },
    { name: 'city', label: 'City', type: 'text', required: true },
    { name: 'category', label: 'What you do', type: 'text', required: true, placeholder: 'e.g. family dentist' },
    { name: 'email', label: 'Email for the report (optional)', type: 'email' },
  ],
};

export type ProductSlug = keyof typeof schemas;
