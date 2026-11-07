# Product 11 — AI Visibility

> AI Visibility is ROI’s service for making ChatGPT, Gemini, Claude, Perplexity and Copilot understand and surface your business. We score your site for AI readability, implement the fixes (schema, llms.txt, answer pages, consistent listings) and track mention rates for real customer questions. No engine can be forced to recommend anyone; we improve the signals they rely on.

**Kind:** SUBSCRIPTION · **Delivery:** HYBRID · **Stripe tax code:** txcd_10103000
**Required integrations (LIVE gate):** stripe, resend

## Plans (seed prices — admin-editable, versioned)
- **Free AI Visibility Audit** — $0.00 one-time: 0–100 AI visibility score; Prioritized fix list; Shareable report page
- **Essentials** — $49.00/month (draft): Implementation on ROI-hosted sites; 10 tracked customer questions; Monthly report
- **Growth** — $99.00/month (draft): Everything in Essentials; 50 tracked questions across engines; Answer pages & entity profile; Listing-consistency worksheet

## Workflow steps
1. audit-crawl
2. score
3. fix-plan
4. implement
5. track-questions
6. monthly-report

## Honesty
No AI engine can be forced to recommend a business. ROI improves how AI understands and surfaces you; results are measured, never guaranteed.

## FAQ
- **Can you guarantee ChatGPT will recommend my business?** No. Nobody can force an AI engine to recommend a business. We improve the signals AI systems rely on — clear entity facts, structured data, answer-ready content and consistent listings — and measure mention rates over time.
- **How do you track AI mentions?** For each tracked question we record whether the business is mentioned, its position, cited sources and sentiment, using official APIs where the provider allows it and logged manual checks by ROI staff otherwise. Every data point shows how and when it was collected.
- **Does this replace SEO?** It builds on it. AI search reads the same web, so technical SEO, local listings and structured data matter even more. AI Visibility focuses on the parts AI assistants rely on most.

## Tracking and reports (built)
- **Tracked questions:** customers add up to 10 (free) questions written the way their customers ask.
- **Mention checks:** only compliant sources. Staff enter manual checks in Control Center → AI Visibility (engine, date, mentioned, position, sentiment, cited sources, answer excerpt); one entry per question + engine + day, recorded with who entered it. Official-API checks arrive with client-supplied keys (Product 10 Part B).
- **Dashboard:** score from the latest audit, 30-day mention rate with an 8-week trend, per-engine table (rate, average position, number of checks, data age), next best actions, questions with their latest result, report downloads.
- **Monthly report:** on the 1st the worker queues one `ai-visibility.report` per workspace with tracked questions; the PDF covers score, mention rate and the change vs the previous month, per-engine results with dates, every question, next actions (claims-filtered) and an honest "how to read this" note. Customers can also create the current month's report (3 per day). Delivered to Products & downloads, by email and as a notification.

## Build status
Audit ✅ · tracked questions ✅ · manual checks ✅ · dashboard ✅ · monthly report ✅ · tests ✅ (`tests/integration/ai-visibility-reports.test.ts`). Pending: per-engine official-API checks with client keys.
