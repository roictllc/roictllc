import type { Metadata } from 'next';
import { Card, Container, DataAge, Pill } from '@/components/ui';
import { ServicePage } from '@/components/service-page';
import { PlatformChip } from '@/components/platform-chip';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Social Media Autopilot — Instagram, TikTok, Facebook & X posted for you', description: 'Connect Instagram, TikTok, Facebook and X once. ROI studies your market, creates on-brand posts, publishes at the best times and shows engagement live.', path: '/social-media' });

export default function SocialMediaPage() {
  return (
    <ServicePage
      path="/social-media" eyebrow="Social Autopilot · Product 9" plainTitle="Social Media Autopilot"
      title={<>Connect once. <span className="roi-gradient-text">Never post again.</span></>}
      answer="Social Media Autopilot connects your Instagram, TikTok, Facebook and X accounts once, then ROI plans, creates and publishes posts for you. It learns which formats, topics and times earn engagement for your account and industry, and your command center shows exactly when ROI posted and how each post performs — with the age of every number."
      cta={{ href: '/register?next=/dashboard/social', label: 'Put my social on autopilot' }}
      steps={[
        ['Connect your accounts', 'One click each for Instagram, TikTok, Facebook and X through their official sign-in screens. Revoke anytime.'],
        ['Set your brand kit', 'Logo, colors, fonts, tone, offers, location and a do-not-say list. Add your own photos.'],
        ['ROI studies your market', 'Your own post history plus industry and local benchmarks. A learning model keeps testing what works.'],
        ['Autopilot or approve-first', 'ROI publishes on its own with your recorded consent — or sends each post for approval. Pause in one click.'],
      ]}
      productSlugs={['social-autopilot', 'animated-gif-logo', 'ai-visibility']}
      faq={[
        { q: 'Which platforms are supported?', a: 'Facebook Pages, Instagram Business/Creator accounts, TikTok and X, each through the platform’s official API. Each one becomes available as soon as its developer approvals are complete.' },
        { q: 'Will ROI like, follow or comment for me?', a: 'No. ROI publishes your posts and reads their metrics. It never automates likes, follows or comments.' },
        { q: 'What does “live engagement” mean?', a: 'Facebook and Instagram can push updates to ROI; other platforms are checked on a short schedule. Every metric shows its source and how old it is — we never present delayed data as instant.' },
        { q: 'Can I stop autopilot?', a: 'Yes — switch to approve-first, pause, or disconnect an account at any time from your dashboard.' },
      ]}
      extra={
        <Container className="py-8">
          <Card className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div className="space-y-3">{(['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'X'] as const).map((p) => <div key={p} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] px-4 py-3"><PlatformChip platform={p} /><Pill tone="neutral">connect after sign-up</Pill></div>)}</div>
            <div>
              <h2 className="font-display text-2xl font-semibold">Your command center</h2>
              <p className="mt-2 text-[var(--color-muted)]">Calendar, approval queue, every post with the exact time ROI published it, reach, engagement rate, best days and times, top posts and plain-language recommendations.</p>
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-black/20 p-4 text-sm">
                <p className="font-semibold">Example label on every metric</p>
                <p className="mt-2"><DataAge at={new Date(Date.now() - 40_000)} source="Meta API" /></p>
              </div>
            </div>
          </Card>
        </Container>
      }
    />
  );
}
