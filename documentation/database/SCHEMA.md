# Database schema

Generated from `packages/database/prisma/schema.prisma`. PostgreSQL 16+ (Neon runs 18). All timestamps are `timestamptz(3)`.

**137 models, 22 enums.** Tenant-owned models carry `workspaceId` and are only reachable through `scoped(workspaceId)` (see `packages/database/src/index.ts`).

Database guards (migration `20261106000100_platform_guards`): `audit_logs` is append-only (trigger `roi_audit_log_immutable` rejects UPDATE/DELETE/TRUNCATE); `social_posts`, `social_post_metric_snapshots` and `automation_jobs` fire `pg_notify` for live dashboards.

| Model | Table | Fields | Tenant-scoped |
|---|---|---|---|
| User | `users` | 26 |  |
| Role | `roles` | 5 |  |
| Permission | `permissions` | 5 |  |
| RolePermission | `role_permissions` | 6 |  |
| UserSession | `user_sessions` | 17 |  |
| PasswordResetToken | `password_reset_tokens` | 8 |  |
| EmailVerificationToken | `email_verification_tokens` | 8 |  |
| LoginAttempt | `login_attempts` | 7 |  |
| RateLimitBucket | `rate_limit_buckets` | 5 |  |
| TwoFactorSecret | `two_factor_secrets` | 8 |  |
| RecoveryCode | `recovery_codes` | 7 |  |
| ImpersonationGrant | `impersonation_grants` | 10 | yes |
| BusinessWorkspace | `business_workspaces` | 33 |  |
| Customer | `customers` | 10 | yes |
| BusinessProfile | `business_profiles` | 22 | yes |
| ManagerProfile | `manager_profiles` | 7 |  |
| ManagerAssignment | `manager_assignments` | 7 | yes |
| CustomerProject | `customer_projects` | 10 | yes |
| CustomerAsset | `customer_assets` | 15 | yes |
| ProductCategory | `product_categories` | 7 |  |
| Product | `products` | 32 |  |
| ProductPlan | `product_plans` | 15 |  |
| ProductPrice | `product_prices` | 18 |  |
| ProductFeature | `product_features` | 9 |  |
| ProductForm | `product_forms` | 7 |  |
| ProductInput | `product_inputs` | 7 |  |
| ProductWorkflow | `product_workflows` | 6 |  |
| ProductCostModel | `product_cost_models` | 18 |  |
| Coupon | `coupons` | 14 |  |
| Bundle | `bundles` | 10 |  |
| Cart | `carts` | 7 | yes |
| CartItem | `cart_items` | 8 |  |
| Order | `orders` | 27 | yes |
| OrderItem | `order_items` | 20 |  |
| Payment | `payments` | 15 |  |
| PaymentFee | `payment_fees` | 8 |  |
| Refund | `refunds` | 11 |  |
| Subscription | `subscriptions` | 17 | yes |
| SubscriptionItem | `subscription_items` | 8 |  |
| Invoice | `invoices` | 18 | yes |
| TaxRecord | `tax_records` | 10 |  |
| FinancialTransaction | `financial_transactions` | 15 | yes |
| RevenueEntry | `revenue_entries` | 13 |  |
| BusinessExpense | `business_expenses` | 12 |  |
| ProductionCost | `production_costs` | 11 |  |
| AdCampaign | `ad_campaigns` | 9 |  |
| AdExpense | `ad_expenses` | 7 |  |
| MonthlyFinancialSummary | `monthly_financial_summaries` | 6 |  |
| AutomationJob | `automation_jobs` | 27 | yes |
| AutomationStep | `automation_steps` | 13 |  |
| AutomationLog | `automation_logs` | 8 |  |
| GeneratedDeliverable | `generated_deliverables` | 23 | yes |
| NotificationLog | `notification_logs` | 9 |  |
| Notification | `notifications` | 9 |  |
| WorkerHeartbeat | `worker_heartbeats` | 6 |  |
| LogoUpload | `logo_uploads` | 9 | yes |
| LogoRender | `logo_renders` | 10 |  |
| LogoConcept | `logo_concepts` | 15 | yes |
| LogoFingerprint | `logo_fingerprints` | 13 |  |
| SimilarityReport | `similarity_reports` | 10 |  |
| EBookCategory | `ebook_categories` | 6 |  |
| EBook | `ebooks` | 25 |  |
| EBookPreviewPage | `ebook_preview_pages` | 7 |  |
| EBookPurchase | `ebook_purchases` | 13 | yes |
| EBookDownload | `ebook_downloads` | 7 |  |
| EBookRightsAttestation | `ebook_rights_attestations` | 8 |  |
| Website | `websites` | 22 | yes |
| WebsitePage | `website_pages` | 8 |  |
| WebsiteVersion | `website_versions` | 11 |  |
| WebsiteDeployment | `website_deployments` | 14 |  |
| WebsiteLead | `website_leads` | 11 |  |
| Domain | `domains` | 20 | yes |
| DomainQuote | `domain_quotes` | 17 | yes |
| DomainRenewal | `domain_renewals` | 10 |  |
| DnsRecord | `dns_records` | 10 |  |
| HostingAccount | `hosting_accounts` | 8 |  |
| UptimeCheck | `uptime_checks` | 10 |  |
| SslCheck | `ssl_checks` | 10 |  |
| SeoAudit | `seo_audits` | 15 | yes |
| SeoFinding | `seo_findings` | 13 |  |
| SeoReport | `seo_reports` | 9 | yes |
| KeywordSuggestion | `keyword_suggestions` | 10 | yes |
| GeoLocationPage | `geo_location_pages` | 13 |  |
| NapCheck | `nap_checks` | 8 | yes |
| UsPlace | `us_places` | 12 |  |
| SearchConsoleSnapshot | `search_console_snapshots` | 6 | yes |
| AiVisibilityAudit | `ai_visibility_audits` | 15 | yes |
| AiTrackedQuestion | `ai_tracked_questions` | 7 | yes |
| AiMentionCheck | `ai_mention_checks` | 15 |  |
| SocialAccount | `social_accounts` | 20 | yes |
| SocialPlan | `social_plans` | 15 |  |
| SocialSubscription | `social_subscriptions` | 9 | yes |
| ContentCalendarItem | `content_calendar_items` | 11 | yes |
| SocialPost | `social_posts` | 20 | yes |
| SocialPostMetricSnapshot | `social_post_metric_snapshots` | 15 |  |
| SocialInsightModel | `social_insight_models` | 10 |  |
| HashtagSet | `hashtag_sets` | 8 | yes |
| BrandKit | `brand_kits` | 14 | yes |
| SocialWebhookEvent | `social_webhook_events` | 7 |  |
| SignatureTemplate | `signature_templates` | 8 |  |
| SignatureSet | `signature_sets` | 12 | yes |
| SignatureEmployee | `signature_employees` | 14 |  |
| SignatureAsset | `signature_assets` | 9 |  |
| KnowledgeSource | `knowledge_sources` | 9 | yes |
| KnowledgeDocument | `knowledge_documents` | 10 |  |
| KnowledgeChunk | `knowledge_chunks` | 11 | yes |
| AssistantConversation | `assistant_conversations` | 9 | yes |
| AssistantMessage | `assistant_messages` | 9 |  |
| AssistantToolCall | `assistant_tool_calls` | 10 |  |
| ClientAiConnection | `client_ai_connections` | 14 | yes |
| AIUsage | `ai_usage` | 11 | yes |
| SupportTicket | `support_tickets` | 14 | yes |
| SupportMessage | `support_messages` | 9 |  |
| SupportAttachment | `support_attachments` | 10 |  |
| ContentReport | `content_reports` | 9 |  |
| Takedown | `takedowns` | 15 |  |
| ModerationDecision | `moderation_decisions` | 9 |  |
| BlockedTerm | `blocked_terms` | 6 |  |
| EmailTemplate | `email_templates` | 10 |  |
| EmailCampaign | `email_campaigns` | 12 |  |
| EmailSubscriber | `email_subscribers` | 11 | yes |
| EmailConsent | `email_consents` | 8 |  |
| EmailSuppression | `email_suppressions` | 5 |  |
| EmailEvent | `email_events` | 10 |  |
| MarketingCampaign | `marketing_campaigns` | 8 |  |
| AffiliateProfile | `affiliate_profiles` | 12 |  |
| Referral | `referrals` | 12 | yes |
| Commission | `commissions` | 11 |  |
| Payout | `payouts` | 10 |  |
| Integration | `integrations` | 13 |  |
| FeatureFlag | `feature_flags` | 7 |  |
| Setting | `settings` | 6 |  |
| AuditLog | `audit_logs` | 10 |  |
| WebhookEvent | `webhook_events` | 9 |  |
| BackupRun | `backup_runs` | 10 |  |
| ContactMessage | `contact_messages` | 10 |  |
| LegalDocument | `legal_documents` | 7 |  |

## Enums

`RoleName`, `UserStatus`, `Visibility`, `ProductKind`, `DeliveryMode`, `PriceInterval`, `OrderStatus`, `SubscriptionStatus`, `JobStatus`, `ScanStatus`, `LedgerType`, `ExpenseCategory`, `IntegrationStatus`, `SocialPlatform`, `PostingMode`, `SocialPostStatus`, `TicketStatus`, `WebsiteStatus`, `DomainStatus`, `SubscriberStatus`, `CommissionStatus`, `DataSource`

## Migrations

- `20261106000000_baseline`
- `20261106000100_platform_guards`

Apply with `npm run db:migrate:deploy` (Prisma) or `npm run db:apply` (built-in applier that refuses destructive SQL; see DECISIONS D-12). Verify with `npm run db:check`.
