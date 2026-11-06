# Product 4 — E-Book Library

> ROI’s E-Book Library sells business, leadership, marketing and self-improvement books. Anyone can read the first three pages of Chapter 1 free. After purchase the full PDF is emailed to you and saved in your ROI library, stamped with your name and order for personal use, with a download history.

**Kind:** PER_ITEM · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10302000
**Required integrations (LIVE gate):** stripe, r2, resend

## Plans (seed prices — admin-editable, versioned)
- **Priced per book** — priced per item: Free 3-page preview; PDF by email; Personal library

## Workflow steps
1. upload
2. validate
3. preview-pages
4. catalog
5. purchase
6. stamp
7. deliver

## Honesty
No guarantees of results; measured data is labeled with source and age.

## FAQ
- **Can I share my copy?** Copies are for personal use and stamped with the buyer’s name and order ID.

## Build status
Pipeline ✅ (packages/product-engine/src/ebooks.ts, 3 tests). Upload UI + jobs: next session.
