import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { JsonLd } from '@/components/json-ld';
import { organizationLd, websiteLd } from '@/lib/seo';
import { AssistantWidget } from '@/components/assistant-widget';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <AssistantWidget />
      <JsonLd data={[organizationLd(), websiteLd()]} />
    </>
  );
}
