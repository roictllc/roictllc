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

## How it works (built)
**Staff (ADMIN/PM/MANAGER, 2FA):** Control Center → E-books → Add a book. The PDF goes straight from the browser to the private bucket with a 15-minute presigned URL (no size limit from the web server; 200 MB cap). Form: title, subtitle, author, category, price (margin guard; a reason is required below the minimum margin), language, tags, Chapter 1 page (empty = auto-detect), preview page count, description, **rights attestation** (blocked if unchecked; stored with user, time and IP).
**Processing job `ebook.ingest`:** ClamAV (when `CLAMAV_HOST` is set) → PDF validation (page cap, encrypted/damaged, active content: JavaScript, launch actions, embedded files, XFA…) → page count → Chapter-1 suggestion (text layer) → cover (page 1) → preview pages Chapter 1 … +N rendered to watermarked PNG images (no text layer). Rejected files mark the book REJECTED.
**Editor:** processing steps, preview images, re-render by changing the Chapter-1 page or count, publish/unpublish/archive (publishing requires processing, previews, cover, attestation and an accepted price), per-book price editor (versioned, Stripe-synced), buyers with download counts, **audited** source download.
**Customers:** `/ebooks` catalog (categories + search over title, author, description, tags), `/ebooks/<slug>` with Book schema, cover and the sample viewer: page images through signed URLs (15 min, `no-store`); only rows in `ebook_preview_pages` can be served — never the PDF. Buy → Stripe → job `product.ebook-library` → buyer-stamped copy (visible footer with name, email, order number on every page + PDF keywords) → "Products & downloads", delivery email. Download limit per purchase (setting `ebook.downloadLimit`, default 5) with history.
**Pricing model:** each book is a plan `book-<id>` on the E-Book Library product, so prices are versioned and protected like every other price; these plans are hidden from the product page.
**Owner step:** for direct uploads the private R2 bucket needs a CORS rule allowing `PUT` from the site origin (see OWNER_CHECKLIST).

## Build status
Upload ✅ · processing ✅ · editor ✅ · catalog ✅ · samples ✅ · purchase + stamping ✅ · download limit ✅ · tests ✅ (`tests/integration/ebooks-flow.test.ts`, real PDFs). Live use needs: R2 (+ CORS), Stripe, Resend.
