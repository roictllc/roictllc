# Security design (spec §6)

| Control | Implementation |
|---|---|
| Passwords | Argon2id (m=19 MiB, t=2, p=1), ≥ 12 chars, common-password list, timing-equalized login for unknown emails |
| Sessions | 256-bit random token in `__Host-roi_session` (HttpOnly, Secure, SameSite=Lax); only SHA-256 stored; staff idle 2 h / absolute 12 h, customers 7 d / 30 d; rotation on privilege change; reuse of a rotated token revokes the family |
| 2FA | TOTP (RFC 6238) mandatory for ADMIN/PM/MANAGER; secrets AES-256-GCM encrypted; ±1 step; replay refused; 10 single-use hashed recovery codes shown once |
| CSRF | Double-submit token (`__Host-roi_csrf`) on every state-changing form/API + strict Origin allow-list; Server Actions also protected by Next's origin check |
| Rate limits | PostgreSQL fixed windows: login (IP + email), signup, reset, contact, audit, assistant, checkout, tickets, leads; lockout after 8 failures / 15 min |
| Authorization | Service-layer permission checks from `role_permissions`; MANAGER limited to assigned workspaces; customer data through the tenant-scoped Prisma extension; cross-tenant tests |
| Headers | Per-request nonce CSP (`strict-dynamic`), HSTS preload, frame-ancestors none, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP |
| SSRF | Connect-time IP validation (private/loopback/link-local/CGNAT/metadata/IPv6 ULA & mapped), http/https + 80/443 only, redirects re-validated, size/time caps, robots.txt, `ROIBot` UA |
| Uploads | Magic-byte allow-list, size and pixel caps (bombs), re-encode (strips EXIF/payloads), EICAR/ClamAV, quarantine until clean, random keys, private by default, short-lived signed URLs after ownership checks |
| Webhooks | Signature verification on raw body (Stripe v1, 5-min tolerance); events stored once |
| Secrets | Zod-validated env at boot (names only in errors); Stripe live/test mode guard; AES-256-GCM for stored credentials |
| Audit | Append-only `audit_logs` enforced by a DB trigger for every role |
| Privacy | JSON export, deletion requests with legal timelines, retention schedule in settings |
| Supply chain | Dependabot, CodeQL, gitleaks, `npm audit` in CI |
