> **Phase 2.** Moved out of the launch scope by the owner on 2026-11-06 (DECISIONS D-21). Nothing below is visible to customers until phase 2 restores it from branch `phase2-social-baseline`.

# Social platforms — requirements to verify at deploy time

| Platform | API | Approval needed | ROI env | Notes |
|---|---|---|---|---|
| Facebook Pages | Graph API (META_GRAPH_VERSION, default v23.0) | Business Verification + App Review for pages_manage_posts, read_insights | META_APP_ID, META_APP_SECRET | Webhooks available for near-real-time updates |
| Instagram (Business/Creator) | Graph API (Instagram Content Publishing) | App Review for instagram_content_publish, instagram_manage_insights | same as Meta | Account must be linked to a Facebook Page |
| TikTok | Content Posting API v2 | Audit required before public posting (unaudited apps post privately) | TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET | PKCE |
| X | API v2 (pay-per-use since Feb 2026) | Paid credits | X_CLIENT_ID, X_CLIENT_SECRET | ~$0.015/plain post, ~$0.20/post with link (Apr 2026) — re-check before pricing |

ROI never automates likes, follows or comments. Each platform's flag (social.facebook / instagram / tiktok / x) can only go LIVE after its integration passes a live check.
