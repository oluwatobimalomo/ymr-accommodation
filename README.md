# YMR Accommodation

## Setup
```bash
npm install
cp .env.example .env.local
npm run db:migrate
SEED_ADMIN_EMAIL=you@example.org SEED_ADMIN_PASSWORD='at-least-12-chars' npm run db:seed
npm run dev
npm test && npm run typecheck
```
