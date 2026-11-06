export const SIGNATURE_TEMPLATES = [
  { slug: 'classic-left', name: 'Classic — logo left' },
  { slug: 'classic-top', name: 'Classic — logo on top' },
  { slug: 'modern-bar', name: 'Modern — accent bar' },
  { slug: 'compact', name: 'Compact one-line' },
  { slug: 'photo-card', name: 'Photo card' },
  { slug: 'banner', name: 'With banner / CTA' },
  { slug: 'divider', name: 'Vertical divider' },
  { slug: 'minimal', name: 'Minimal text' },
  { slug: 'bold-name', name: 'Bold name' },
  { slug: 'corporate', name: 'Corporate with disclaimer' },
] as const;
export type SignatureTemplateSlug = (typeof SIGNATURE_TEMPLATES)[number]['slug'];
