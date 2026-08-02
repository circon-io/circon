-- Maps a Stripe customer back to a Clerk organization.
--
-- Clerk metadata is the source of truth for *which plan* an org is on; this
-- table exists only so webhooks that carry a customer id and nothing else can
-- still be attributed. Without it, a `customer.subscription.deleted` arriving
-- without metadata would be silently dropped and the org would keep paid access.
CREATE TABLE IF NOT EXISTS stripe_customers (
  stripe_customer_id TEXT PRIMARY KEY,
  org                TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_org ON stripe_customers (org);
