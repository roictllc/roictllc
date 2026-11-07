import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { inter, jetbrains, spaceGrotesk } from './fonts';
import { SITE } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'ROI — Get recommended by AI. Grow with one platform.', template: '%s | ROI' },
  description: SITE.description,
  applicationName: 'ROI',
  icons: { icon: '/icon.svg' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#04050D', colorScheme: 'dark', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-[var(--color-ink)]">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
