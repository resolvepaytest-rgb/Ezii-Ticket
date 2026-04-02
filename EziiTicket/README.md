# EziiTicket

## Client (React + TypeScript + Vite + Tailwind + Shadcn)

```bash
cd client
npm install
npm run dev
```

## Server (Node + Express + Nodemon + Postgres `pg` Pool)

1) Create `.env` from `.env.example`:

```bash
cd server
copy .env.example .env
```

2) Install & run:

```bash
npm install
npm run dev
```

### Endpoints

- `GET /health`
- `GET /db/health` (requires `DATABASE_URL`)

