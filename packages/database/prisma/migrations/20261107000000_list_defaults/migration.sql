-- Scalar lists get an empty-array default so records can be created without them (found by the e-book tests).
-- Additive: only SET DEFAULT, no data or type changes.
ALTER TABLE "products" ALTER COLUMN "requiredIntegrations" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "bundles" ALTER COLUMN "planIds" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "logo_fingerprints" ALTER COLUMN "huMoments" SET DEFAULT ARRAY[]::DOUBLE PRECISION[];
ALTER TABLE "ebooks" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ai_mention_checks" ALTER COLUMN "citedSources" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "social_accounts" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "social_plans" ALTER COLUMN "platforms" SET DEFAULT ARRAY[]::"SocialPlatform"[];
ALTER TABLE "social_plans" ALTER COLUMN "approvalOptions" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "social_posts" ALTER COLUMN "hashtags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "social_posts" ALTER COLUMN "mediaKeys" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "hashtag_sets" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "brand_kits" ALTER COLUMN "doNotSay" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "brand_kits" ALTER COLUMN "photoAssetIds" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" SET DEFAULT ARRAY[]::DOUBLE PRECISION[];
ALTER TABLE "client_ai_connections" ALTER COLUMN "features" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "email_subscribers" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "integrations" ALTER COLUMN "requiredEnv" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "integrations" ALTER COLUMN "missingEnv" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "integrations" ALTER COLUMN "unlocks" SET DEFAULT ARRAY[]::TEXT[];
