# YMR Accommodation

Booking and accommodation management for the Young Ministers Retreat. Guests can browse lodges, reserve accommodation, and pay online. Staff manage inventory, bookings, check-in, support, and operational reports through a role-based admin area.

Built with Next.js, TypeScript, PostgreSQL, and Drizzle ORM. Deployed on Vercel; payments use Paystack and transactional email uses Resend.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Set `DATABASE_URL` to the application database and `DATABASE_URL_DIRECT` to its direct connection for migrations. Add the required service keys and URLs described in `.env.example`, then run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before seeding. The seed command creates the initial Super Admin account. Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Production services

Configure the production environment variables in Vercel. Point the Paystack webhook to `/api/webhooks/paystack`. Schedule authenticated requests to `/api/cron/email-outbox` using the `CRON_SECRET` bearer token so failed email deliveries can be retried.
