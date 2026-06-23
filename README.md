# Products API

Production-ready Node.js backend for browsing a large product catalog with **cursor-based (keyset) pagination**, optimized PostgreSQL indexes, and efficient batch seeding.

Hosted on **[Supabase](https://supabase.com)** (managed PostgreSQL).

## Stack

- **Node.js** + **Express.js**
- **Supabase** (PostgreSQL) + **Prisma ORM**
- **Zod** for request validation

## Project structure

```
src/
  config/          Environment variable loading and validation
  database/        Prisma client singleton
  middleware/      Error handling and request validation
  routes/          HTTP route definitions
  controllers/     Request/response handling
  services/        Business logic and database queries
  utils/           Cursor encoding, errors, async helpers
prisma/
  schema.prisma    Product model and indexes
  seed.js          Batch seed script (200k products)
```

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

## Quick start

### 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Wait for the database to finish provisioning.
3. Open **Project Settings → Database → Connection string**.

You need **two** connection strings:

| Variable       | Supabase setting              | Port | Used for                          |
|----------------|-------------------------------|------|-----------------------------------|
| `DATABASE_URL` | **Transaction** pooler        | 6543 | Running API (add `?pgbouncer=true`) |
| `DIRECT_URL` | **Direct connection**         | 5432 | Migrations and seeding            |

Replace `[YOUR-PASSWORD]` with your database password from the same settings page.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Paste your Supabase connection strings into `.env`:

```env
DATABASE_URL="postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

> **Tip:** If migrations fail with the pooler URL, confirm `DIRECT_URL` uses port **5432** (Direct connection), not 6543.

### 4. Run migrations

```bash
npm run db:deploy
```

For local development when creating new migrations:

```bash
npm run db:migrate
```

This creates the `products` table and composite indexes in your Supabase database. You can verify in the Supabase **Table Editor**.

### 5. Seed the database

```bash
npm run db:seed
```

Inserts **200,000** products in batches of **5,000** using `createMany`.

Seeding over the network to Supabase can take several minutes. If you hit timeouts on the free tier, lower the batch size:

```env
SEED_BATCH_SIZE=2000
```

### 6. Start the server

```bash
# Development (with file watch)
npm run dev

# Production
npm start
```

The API listens on `http://localhost:3000` by default.

## API usage

### `GET /products`

Returns products sorted by **most recently updated first** (`updated_at DESC, id DESC`).

**Query parameters**

| Parameter  | Type   | Default | Description                                      |
|------------|--------|---------|--------------------------------------------------|
| `category` | string | —       | Optional category filter (exact match)           |
| `limit`    | number | `50`    | Page size (max `100`)                            |
| `cursor`   | string | —       | Opaque cursor from a previous response           |

**Response**

```json
{
  "items": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "Premium Widget 4821",
      "category": "Electronics",
      "price": "129.99",
      "created_at": "2024-03-15T10:22:11.000Z",
      "updated_at": "2025-06-01T08:45:30.000Z"
    }
  ],
  "nextCursor": "eyJ2IjoxLCJ1IjoiMjAyNS0wNi0wMVQwODo0NTozMC4wMDBaIiwiaSI6IjNmYTg1ZjY0LTU3MTctNDU2Mi1iM2ZjLTJjOTYzZjY2YWZhNiJ9"
}
```

When there are no more results, `nextCursor` is `null`.

**Examples**

```bash
# First page (default limit 50)
curl "http://localhost:3000/products"

# Filter by category
curl "http://localhost:3000/products?category=Electronics&limit=20"

# Next page using cursor
curl "http://localhost:3000/products?cursor=<nextCursor from previous response>"
```

### `GET /health`

```bash
curl "http://localhost:3000/health"
```

## Supabase + Prisma notes

- **Prisma** talks to Supabase PostgreSQL like any Postgres host — no schema changes required.
- **`DATABASE_URL`** (pooler, port 6543) is used by the running API for efficient connection pooling.
- **`DIRECT_URL`** (direct, port 5432) is required for `prisma migrate` and `prisma db seed` because migrations need session-level features PgBouncer does not support.
- UUID primary keys and composite indexes work natively on Supabase.
- View and manage data in the Supabase **Table Editor** or **SQL Editor**.

## Indexing strategy

Two composite indexes align with the query patterns:

1. **`(updated_at DESC, id DESC)`** — supports the default listing query ordered by recency.
2. **`(category, updated_at DESC, id DESC)`** — supports filtered listings when `category` is provided.

Both indexes match the `ORDER BY updated_at DESC, id DESC` sort and the keyset `WHERE` clause:

```sql
(updated_at < :cursor_updated_at)
OR (updated_at = :cursor_updated_at AND id < :cursor_id)
```

PostgreSQL can seek directly into the index instead of scanning and sorting large result sets.

The `id` column is included as a **tie-breaker** so rows sharing the same `updated_at` have a stable, deterministic order.

## Why cursor pagination over offset pagination?

**Offset pagination** (`OFFSET 100 LIMIT 50`) has two major problems at scale:

1. **Performance** — PostgreSQL must scan and discard all skipped rows. `OFFSET 100000` gets progressively slower.
2. **Consistency** — If products are inserted or updated while a user pages through results, row positions shift. A user on page 2 might see duplicates or miss rows when loading page 3.

**Keyset (cursor) pagination** avoids both issues:

- The database uses an index seek from the last seen `(updated_at, id)` pair.
- New or updated rows only affect whether they appear in future pages — they do not shift existing cursor boundaries.

This implementation fetches `limit + 1` rows to detect a next page without a separate `COUNT` query.

## Consistency during live data changes

| Scenario | Behavior |
|----------|----------|
| New product inserted with a recent `updated_at` | Appears on the first page for new visitors; does not shift cursors already issued to in-progress sessions |
| Existing product updated | Moves toward the front of the list; clients who already passed its old position will not see it again; clients who have not reached it yet may encounter it |
| Product deleted | Simply absent from subsequent pages; no offset drift |

Clients should treat each page as a **snapshot** anchored at query time. For strict read-your-writes semantics, a client could restart from the first page after mutations.

## Deployment

Deploy the API to any Node.js host (Railway, Render, Fly.io, etc.) and set the same Supabase env vars.

```bash
docker build -t products-api .
docker run --env-file .env -p 3000:3000 products-api
```

The production image runs `prisma migrate deploy` (via `DIRECT_URL`) before starting the server.

### Environment variables

| Variable            | Required | Description                                           |
|---------------------|----------|-------------------------------------------------------|
| `DATABASE_URL`      | Yes      | Supabase transaction pooler URI (`?pgbouncer=true`)   |
| `DIRECT_URL`        | Yes      | Supabase direct connection URI (migrations / seed)    |
| `PORT`              | No       | HTTP port (default `3000`)                            |
| `NODE_ENV`          | No       | `development` or `production`                         |
| `SUPABASE_URL`      | No       | Project URL (optional, for future integrations)     |
| `SUPABASE_ANON_KEY` | No       | Anon key (optional, for future integrations)          |

## Scripts

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm run dev`        | Start with Node watch mode           |
| `npm start`          | Start production server              |
| `npm run db:migrate` | Create/apply dev migrations          |
| `npm run db:deploy`  | Apply migrations to Supabase         |
| `npm run db:seed`    | Seed 200k products                   |
| `npm run db:reset`   | Reset DB, migrate, and re-seed       |

## Possible improvements (given more time)

- **Supabase Row Level Security** policies if exposing data via Supabase client
- **Read replicas** via Supabase Pro for horizontal read scaling
- **Redis caching** for hot first-page and category queries
- **Full-text search** on product names (PostgreSQL `tsvector` or Supabase full-text)
- **OpenAPI / Swagger** documentation
- **Integration and load tests** (e.g. k6) to validate index usage under concurrency
- **Rate limiting** and API authentication
- **Observability** — structured logging, metrics, and distributed tracing

## License

ISC
