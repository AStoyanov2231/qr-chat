# Payments: tier billing decision (2026-10-20)

## Decision
- **Web:** Stripe Checkout + Customer Portal.
- **iOS/Android:** Apple/Google in-app purchase.
- **Unify:** one `entitlements` table in Supabase. App and RLS read only this table.
- **Launch with RevenueCat** as the entitlement hub (Stripe connected as a store). The table stays ours, so RevenueCat can be dropped later without app changes.

## Store rules (as of Oct 2026)
- **Apple (US):** external payment links allowed, 0% commission today. Apple proposed 5/10/15% (Aug 2026), court has not approved. Build the web link behind a flag.
- **Apple (outside US):** in-app purchase required for digital tiers. No links or prices pointing to Stripe.
- **Google:** service fee starts at 10% on first $1M. Extra 5% billing fee only for Play Billing in US/UK/EEA. Alternative billing or external links skip the billing fee.

## What others do
- Uber/Airbnb: physical goods/services, own processor, no Apple cut.
- Tinder/Match: still mostly in-app purchase, but bypassing Apple in the US. About $130M alternative-payment savings expected in 2026, almost all from Apple. Google change gives about $5M in 2027.
- Spotify, Patreon, Fortnite: pushed users to external payment in the US.
- Hinge: reported plans for own payment system, not confirmed launched.
- Grindr/Bumble: from memory only, in-app purchase plus web. Unverified.

## RevenueCat
- Free up to $2,500 monthly tracked revenue, then 1%. A billing FAQ says 1% applies to the whole month once over the threshold. Confirm on the live pricing page.
- Not required. Own-table route is cheaper but about 2-3x the work.

## Own-table design (works with or without RevenueCat)
- `entitlements`: `user_id`, `tier`, `status`, `source` (stripe/apple/google), `external_id`, `expires_at`, `updated_at`.
- Stripe: webhook Edge Function (`customer.subscription.*`, `invoice.payment_failed`), `user_id` in customer metadata.
- Apple: App Store Server Notifications V2, verify signed JWS, map via `appAccountToken`.
- Google: RTDN via Pub/Sub, then fetch real state from Play Developer API, map via `obfuscatedAccountId`.
- Native purchase: send token to backend to verify and write the row. Never trust client state.
- One row per user per source, effective tier = highest active.
- Block a second purchase while any source is active.
- Daily reconciliation job for missed webhooks.
- Show the right manage link by `source` (Stripe Portal vs store settings).
- Expo: in-app purchase needs a dev build. Enable Stripe Tax.

## Build order
1. Tier definitions + `entitlements` migration (new `supabase migration new` file).
2. Stripe web checkout + portal, entitlements working on web.
3. RevenueCat + Stripe connection + webhook function.
4. Native in-app purchase + paywall.
5. US-only "pay on web" link behind a flag.

## Open
- Tiers and prices not defined yet.
- RevenueCat vs own table: pick before step 3.
