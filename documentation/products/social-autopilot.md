> **Phase 2.** Moved out of the launch scope by the owner on 2026-11-06 (DECISIONS D-21). Nothing below is visible to customers until phase 2 restores it from branch `phase2-social-baseline`.

# Product 9 — Social Media Autopilot

> Social Media Autopilot connects your Instagram, TikTok, Facebook and X accounts once, then ROI plans, creates and publishes posts for you. It learns which formats, times and topics earn engagement for your account and industry, and shows live results with clear data ages. You can switch to approve-first or pause at any time.

**Kind:** SUBSCRIPTION · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10103000
**Required integrations (LIVE gate):** stripe, meta, tiktok, x, r2, worker

## Plans (seed prices — admin-editable, versioned)
- **Starter** — $49.00/month (draft): 12 posts / month; 2 platforms; Approve-first or Autopilot
- **Growth** — $99.00/month (draft): 30 posts / month; All 4 platforms; Best-time learning; Live command center
- **Pro** — $199.00/month (draft): 60 posts / month; All 4 platforms; Manager review option; Monthly strategy report

## Workflow steps
1. connect-accounts
2. brand-kit
3. choose-mode
4. plan-calendar
5. generate
6. approve-or-autopilot
7. publish
8. measure
9. learn

## Honesty
ROI optimizes for engagement but never promises specific results. Platform data arrives with delays; every metric shows its source and age.

## FAQ
- **Do I ever have to post again?** Not if you choose Full Autopilot. ROI plans, creates and publishes on its own after you record your consent. You can switch to approve-first, pause or stop at any time.
- **Does ROI like, follow or comment on my behalf?** No. ROI only publishes your posts and reads their metrics through each platform’s official API. It never automates likes, follows or comments.
- **How “live” is the engagement data?** Facebook and Instagram can push updates; other platforms are checked on a short schedule. Every number shows where it came from and how old it is.

## Build status
Engine ✅ (packages/social-engine, 9 tests), OAuth routes ✅, command center ✅. Platforms hidden until Meta/TikTok/X approvals; publisher + metrics ingestion: next session.
