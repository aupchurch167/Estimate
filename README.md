# Quill

AI-powered commercial construction estimating tool. A non-expert produces an
80% draft by talking to AI; an expert reviewer corrects and finalizes. Built
first for Mark Allan Contracting, multi-tenant SaaS from day one.

This repository follows the build sequence in `quill-build-playbook.md`. Each
phase builds on the last; phase 0 lays the scaffolding everything else
depends on.

## Stack

- **Frontend** — React 18, Vite, TypeScript, Tailwind CSS, TanStack Query,
  Zustand, Axios, Zod
- **Backend** — Node 20+, Express, TypeScript, Prisma, PostgreSQL, Zod
- **Database** — PostgreSQL (Neon in production, local Postgres or a Neon dev
  branch in development)

The frontend dev server runs on port `5173`; the backend dev server runs on
port `4000`.

## Repository layout

```
.
├── frontend/                 React + Vite SPA
│   ├── src/
│   │   ├── pages/            Route-level views
│   │   ├── components/       Shared, reusable UI
│   │   ├── features/         Feature-scoped folders (auth, estimates, …)
│   │   ├── hooks/            Reusable hooks
│   │   ├── lib/              HTTP client, query client, env, helpers
│   │   ├── context/          React contexts
│   │   └── styles/           Tailwind tokens + base CSS
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── backend/                  Express API
│   ├── src/
│   │   ├── routes/           Express route definitions
│   │   ├── controllers/      HTTP handlers
│   │   ├── services/         Business logic
│   │   ├── middleware/       Auth, logging, error handling, RBAC
│   │   ├── utils/            Cross-cutting helpers
│   │   ├── prompts/          AI prompt builders
│   │   ├── templates/        PDF + email templates
│   │   ├── lib/              Prisma client, JWT, logger, etc.
│   │   └── emails/           React Email templates
│   ├── prisma/               schema.prisma + migrations + seed
│   └── scripts/              Operator scripts
│
├── package.json              npm workspaces root
└── quill-build-playbook.md   Phase-by-phase build instructions
```

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL (local instance, Docker, or a Neon dev branch URL)

## Getting started

```bash
# 1. Clone and install
git clone <repo-url> quill
cd quill
npm install

# 2. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit backend/.env to set DATABASE_URL

# 3. Run the dev servers (separate terminals)
npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:5173
```

The full Prisma schema, seed data, environment validation, auth, and the rest
of the application come online phase by phase. Follow
`quill-build-playbook.md` for the order.

## Scripts (root)

| Script                  | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `npm run dev:frontend`  | Start the Vite dev server on port 5173       |
| `npm run dev:backend`   | Start the Express dev server on port 4000    |
| `npm run build:frontend`| Build the production frontend bundle         |
| `npm run build:backend` | Compile backend TypeScript to `backend/dist` |
| `npm run typecheck`     | Run `tsc --noEmit` across both workspaces    |

## License

Proprietary. © Mark Allan Contracting / Built Different.
