# YMR Accommodation - Phase 1-4 (Foundation, Inventory, Booking, Operations groundwork)

Next.js 15 (App Router) + TypeScript, Drizzle ORM, Postgres (Neon), deployed on Vercel.

## Everything built so far, by area

**Branding:** real YMR/RCCG flame-and-dove logo in `public/`; theme colors in `src/theme/tokens.ts` sampled directly from it (brand orange `#E8720E`, navy `#282068`, emerald `#0F8A3E`). Typography is still a system-font placeholder — the real YMR typeface was never extracted from the live site.

**Foundation:** `events`, `users`, `roles`, `permissions`, `sessions`, append-only `audit_logs` (DB trigger blocks UPDATE/DELETE/TRUNCATE); argon2id auth with lockout; fail-closed RBAC (`authorize()`).

**Inventory:** `lodges` → `accommodation_categories` → `accommodation_units` → `rooms` → `bedspaces`, plus `facilities`. Database-trigger invariants: bedspace letters unique per room, room/unit capacity auto-sync, room gender must match category, facilities can't be deleted while in use, bedspaces have no delete path (only retirement). Full admin UI down to individual bedspace status. Image upload works on lodges (multiple photos, remove individually) — stored as base64 in the database (a deliberate MVP shortcut, not real object storage; see the limitations list).

**Customer booking:** `inventory_holds`, `bookings`, `booking_occupants`. The anti-oversell guarantee is a unique index enforced by Postgres itself, not just application logic. Covers customer-picked bedspace, entire-room booking, system auto-allocation (`SKIP LOCKED`), and private whole-unit booking. Public pages: `/accommodation`, `/accommodation/[slug]`, `/booking/[categoryId]` (seat-map picker), `/booking/reference/[reference]`, `/check-booking`. **Scope simplification, documented not hidden:** PRIVATE categories book at the whole-unit level only, matching every private example in the brief; the schema supports per-room private booking too, `createBooking` just doesn't route to it yet.

**Admin dashboard:** real counts (lodges, categories, units, bedspaces, live availability, bookings by payment status), not a placeholder.

Tests: **200 total**, all against real (in-process) Postgres, not mocks.

## This pass: two real bugs found from your screenshots

**1. Bedspace lettering broke past 26.** Your screenshot showed bedspaces numbered 27-40 sorting *before* A-Z — that's because the old code fell back to plain numbers once letters ran out, and text-sorts digits before letters. Fixed to use spreadsheet-style double letters instead (A, B, ... Z, AA, AB, ...), which never looks broken regardless of count. This also exposed a second bug in the same area: the bedspace list was sorted as plain alphabetical text, which put "AA" right after "A" (before "B") instead of after "Z" — fixed to sort by length first, then alphabetically, so the order always matches how they were actually created. A new test locks in both fixes.

**2. The bedspace-status section repeated a full form per bedspace.** With dozens of bedspaces, that meant scrolling through dozens of near-identical blocks to change one status. Replaced with a single compact form: pick the bedspace from a dropdown, pick the new status, one button.

Tests: **223 total** (was 222).

## This pass: simplified admin workflow, based on direct feedback

**1. All "reason required" friction removed.** Every status change, capacity change, price change, and booking cancellation used to force typing a justification first. That's gone from both the service layer (reason is now optional everywhere, not validated) and every form in the UI. Audit logging is unaffected — actions are still recorded, just without demanding an explanation to proceed.

**2. Lodge editing reduced to exactly what's needed**, per spec: Name, Address, Proximity to Old Auditorium (km) — new field, `lodges.proximity_km` — Lodge coordinator (name + phone, reusing the existing contact fields), photos, Save. The old page tried to do lodge details AND category creation on one screen; that's gone.

**3. A genuinely new, simpler apartment workflow**, replacing the old multi-step Category → Unit → Room → Bedspace admin flow with one "Add an apartment" step:
- Pick **Mode** first (Private/Shared), and the form changes shape accordingly.
- **Private**: Name, Price, amenity checkboxes.
- **Shared**: Gender, Number of bedspaces, Price per bedspace.
- One submission creates everything needed underneath — category, unit, and (for shared) a room with correctly-lettered bedspaces — in a single atomic transaction. The admin never sees or manages "category" and "unit" as separate concepts.
- A new unified `/admin/apartments/[id]` page replaces having to jump between three separate pages to manage one apartment: name/price, photos, and (mode-appropriate) either amenities or bedspace status/add-more, all in one place.
- `src/lib/inventory/apartments.ts` is genuinely new service code, not a UI reshuffle — 9 new tests confirm it against real Postgres, including proof that the simplified flow still can't bypass the Phase 2 gender-matching trigger underneath.

**A real gap I caught before shipping, not after:** the apartment edit page's save buttons all pointed at `/api/admin/apartments/[id]`, which I'd forgotten to actually build — only the creation route existed. Every save action would have 404'd. Caught by rebuilding and testing before packaging, not by you finding it.

**Old `/admin/categories`, `/admin/units`, `/admin/rooms` pages are still in the codebase** but no longer linked from the main flow — kept as a safety net rather than deleted outright, in case anything still depends on them internally. Nothing currently links to them.

Tests: **222 total** (was 213).

## This pass: three real gaps fixed based on direct feedback

**1. Booking reference is no longer sequential/guessable.** It was `YMR26-ACM-00001`, `00002`, `00003`... — trivially enumerable by anyone incrementing the number in a URL, which could expose or let someone attempt to interact with another customer's booking. Now `src/lib/booking/reference.ts` generates an unpredictable 8-character code (~40 bits of entropy, drawn from an alphabet that excludes visually-ambiguous characters like `0`/`O` and `1`/`I` so it's still easy to read aloud or type at check-in) — e.g. `YMR26-ACM-7K9XQP24`. The event's booking counter is still incremented for internal reporting, but no longer appears in the public reference.

**2. Apartments (units) can now have photos**, not just lodges. This was a real gap, not a misunderstanding: the facilities checklist already lived on the unit edit page (`/admin/units/[id]`), but there was nowhere to add pictures of the apartment itself — exactly the "check amenity boxes + add photos" workflow the brief describes for listing an apartment. Photo upload now sits right next to the facilities checklist on that same page, using the same upload pattern already built for lodges. Photos now also show up as thumbnails on the admin category page's unit cards and on the public booking page's "Choose a unit" picker — uploading them was pointless without also displaying them anywhere.

**3. Payment/accommodation status is easier to follow at a glance.** Added `BookingStatusTracker`, a plain-language step tracker (Reserved → Paid → Allocated → Checked in → Checked out) shown on both the booking confirmation page and `/check-booking`, instead of only raw status enum labels.

**Also fixed in this pass: a real payment bug, not a code issue on our end.** Live testing surfaced `amount_mismatch` on every single payment attempt. The cause: the connected Paystack account is configured so the *customer* bears the transaction fee, so Paystack's checkout adds its fee on top and the amount actually collected (`amountMinor` in the verify response) is legitimately higher than what was requested. Paystack's API anticipates this exact case with a separate `requested_amount` field; the fix was comparing against that field instead of the fee-inclusive gross amount. A new test (`confirm-payment.test.ts`) reproduces the exact real-world numbers involved (₦15,000 requested vs. ₦15,329.95 collected) to lock this in.

**Also fixed: a silent-failure bug that made this hard to diagnose.** The confirmation page's payment-verification step had a bare `catch {}` block with no logging at all — any real error there vanished with zero trace. Fixed to log every failure mode with the specific expected-vs-received values, which is what made diagnosing the fee issue possible in the first place.

Tests: **213 total** (was 212).

## Paystack payments (previous pass)

Real, end-to-end payment integration, built to match the researched Paystack API contract exactly (Bearer auth, kobo amounts, HMAC-SHA512 webhook signatures over the raw body).

- **Schema:** `payment_transactions` (one row per attempt, keeps the full history) and `payment_events` (idempotency guard — a duplicate webhook delivery hits a unique-constraint violation and is safely ignored).
- **`src/lib/payments/paystack.ts`:** `initializeTransaction`, `verifyTransaction`, `verifyWebhookSignature`. A thin, mockable client — the actual HTTP calls to Paystack **could not be tested from this sandbox** (no network access to `api.paystack.co` here), so signature verification and all confirmation logic are fully tested, but the live "create a booking, pay with a test card, see it confirm" path needs to be run on your machine.
- **`src/lib/payments/confirm-payment.ts`:** the single idempotent confirmation function that both the webhook and the browser-callback verification call. Handles: matching payment (marks PAID + ALLOCATED, deletes the now-unneeded hold), duplicate confirmation (no-op), amount/currency mismatch (refuses to mark paid, opens a support ticket automatically instead), and the rare case of payment landing after a hold already expired (marks PAID since the money is real, but does **not** silently re-claim inventory — opens a ticket for manual reallocation instead).
- **A real bug found and fixed while testing this**: the mismatch and manual-review paths originally called the ticket-creation service function from inside an already-open transaction — since that function opens its own transaction, this deadlocked on the same connection. Four tests genuinely hung on this before it was fixed; now fixed by writing directly against the caller's transaction instead. Worth knowing this class of bug exists and to watch for it if you add more cross-service calls inside transactions later.
- **Booking flow:** `/api/booking/create` now initializes a Paystack transaction and redirects to the hosted checkout page after creating the booking. If `PAYSTACK_SECRET_KEY` isn't set, it falls back to the plain confirmation page at PENDING, so local dev still works before you add keys.
- **Webhook:** `/api/webhooks/paystack` — verifies signature over the raw body, dedupes via `payment_events`, re-verifies against Paystack's API directly rather than trusting the payload, then calls the shared confirmation function.
- Admin booking detail page now shows the payment transaction history for that booking.

**To actually test this yourself:** add `PAYSTACK_SECRET_KEY` (your test-mode secret key) to `.env.local`, restart the dev server, and make a real test booking. For the webhook specifically to reach your local machine, Paystack needs a publicly reachable URL — either deploy to Vercel first, or use a tunnel tool like ngrok for local testing, and register that URL in your Paystack dashboard under Settings → API Keys & Webhooks. The browser-callback verification path works in plain local dev without any tunnel, since your server calls out to Paystack directly.

Tests: **212 total** (was 200) — added webhook signature tests and 6 tests covering every confirmation outcome.

## This pass: critical bug fixes + support tickets + admin booking visibility

**Two real bugs found and fixed, both verified with new tests against real Postgres:**

1. **Stuck-bedspace bug (critical).** A bedspace assigned to a booking that never got paid could become permanently unavailable — expiring its hold only deleted the hold row, not the booking's occupant assignment. Fixed: `sweepExpiredHolds` now cancels the associated PENDING booking and clears its occupants' inventory assignment before removing the hold, so the bedspace genuinely returns to AVAILABLE. A paid booking's hold is never touched. Two new tests in `tests/hold-expiry-release.test.ts` prove both halves of this.
2. **Raw SQL errors leaking to customers**, violating the brief's own error-handling requirement (section 47) — visible in a screenshot during testing (`Failed query: delete from "inventory_holds"...` shown on a public page). Fixed with a shared `src/lib/safe-error.ts` helper, applied to every public and admin route; only deliberately-thrown, safe messages ever reach the user now.

**New this pass:**
- **Support tickets** (brief section 30): schema (`support_tickets`, `support_ticket_messages`), public ticket creation at `/support` (no login required), admin list/detail/reply/status pages at `/admin/support`.
- **Admin booking visibility** (previously completely missing): `/admin/bookings` list and `/admin/bookings/[id]` detail, with cancellation (releases inventory, requires a reason, fully audited).
- **Legal/info pages** that were linked from the header/footer but 404'd: `/terms`, `/privacy`, `/faq` (terms and privacy are clearly-marked placeholder content — replace before real bookings open).
- Tests: **200 total** (was 193) — added hold-expiry-release, support ticket, and booking-cancellation tests.

## Honest status against the full 60-section brief

**Solid and tested:** inventory hierarchy, race-condition-safe booking/holds, gender enforcement, RBAC, audit logging, event config, support tickets, admin booking visibility.

**Still not built — this is the real remaining work, not yet started:**
- **Check-in / check-out** (sections 24-25) and **key custody** (sections 26-29) — no schema, no service, no UI.
- **Reallocation** (section 33) — no way to move an occupant between bedspaces after booking, beyond a full cancel.
- **Reports and CSV/Excel export** (section 35) — none exist.
- **Email notifications** (section 38) — nothing is emailed at any point in the flow, including payment confirmation.
- **Admin users/roles management UI** — staff accounts can currently only be created by editing environment variables and rerunning the seed script.
- **Admin audit log viewer** — the audit log is written correctly (verified by tests) but nothing lets you browse it yet.
- **Admin events management** — the seed script edits the one event directly; no UI exists.
- **Standalone `/admin/categories`, `/admin/units`, `/admin/rooms` list pages** — still only reachable by drilling down from a lodge.
- **Officer-to-lodge assignment** — the lodge-scoped role exists but has no way to actually be scoped to a lodge yet.
- **Unit image uploads** — only lodges support photo upload so far.
- **Paystack refunds** — not automated; the brief's own recommended approach (manual refund via the Paystack dashboard, recorded in our system) is what's assumed until this is built.

## Setup
```bash
npm install
cp .env.example .env.local
npm run db:migrate
SEED_ADMIN_EMAIL=you@example.org SEED_ADMIN_PASSWORD='at-least-12-chars' npm run db:seed
npm run dev
npm test && npm run typecheck
```

**If you ever see a "Couldn't load dashboard data" or similar DB error:** it almost always means `npm run db:migrate` hasn't been run against whatever database the app is currently pointed at. Run it and reload.
