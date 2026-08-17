# WhatsApp Asistan — Frontend

Seller-facing Next.js application for the WhatsApp Asistan product. The
backend (FastAPI + Supabase) is the source of truth; this package only
renders the seller panel and the public marketing site.

## Stack

- **Next.js 15** (App Router, React 19)
- **TypeScript** (strict)
- **Tailwind CSS 3** wired to the Sakin Ustalık design tokens
- **shadcn/ui-style** primitives (Radix UI under the hood)
- **Supabase** for session management only (`@supabase/ssr`)

No state library, no form library, no animation library, no chart library
is included in the foundation step. They are added per feature as the
backend contract is read.

## Folder architecture

```
src/
├── app/             Next.js App Router routes
│   ├── (public)/    Marketing site
│   ├── (auth)/      Authentication flow
│   ├── seller/      Seller panel
│   ├── admin/       Admin surface (route shell only for now)
│   ├── layout.tsx   Root layout (fonts, globals.css)
│   ├── globals.css  Design tokens + base styles
│   ├── loading.tsx  Root loading UI
│   ├── error.tsx    Root error boundary
│   └── not-found.tsx
│
├── components/      Shared UI
│   ├── ui/          shadcn-style primitives (Button, Input, Sheet, …)
│   ├── shared/      Cross-surface composed pieces (added per step)
│   ├── marketing/   Marketing sections (added in marketing step)
│   ├── seller/      Seller feature components
│   └── admin/       Admin components (added in admin step)
│
├── lib/             Cross-cutting infrastructure
│   ├── api/         Fetch wrapper + typed ApiError
│   ├── auth/        Server session inspection
│   ├── supabase/    Browser / server / middleware Supabase clients
│   ├── types/       Shared TypeScript types
│   ├── constants/   Cross-feature constants
│   ├── validation/  Form schemas (added per feature)
│   └── utils/       cn(), future helpers
│
└── config/          Static configuration
    ├── env.ts            Typed env access (required vars throw early)
    ├── site.ts           Marketing site name & metadata
    ├── navigation.ts     Seller panel navigation model
    └── design-tokens.ts  Canonical Sakin Ustalık tokens
```

## Getting started

```bash
cd frontend
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` is git-ignored. Never commit secrets.

## Environment variables

| Name | Required | Visibility | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | yes | browser | FastAPI backend base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | browser | Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | production | browser | Public site origin used for metadata/canonical URLs; local development may omit it |

Public API, Supabase, and configured site URLs must use HTTPS outside local
loopback development. Plain HTTP is accepted only for `localhost`,
`127.0.0.1`, and `::1` so local development remains straightforward without
allowing production Bearer/session traffic to be configured over plaintext.

The service role key, database URL, JWT secret, OpenAI key, and any
backend secret **must never** appear in this package.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (Next.js config) |
| `npm run typecheck` | TypeScript `tsc --noEmit` |

## Design tokens

All visual constants are declared in `src/config/design-tokens.ts` and
exposed as CSS variables in `src/app/globals.css`. Tailwind classes
(`bg-primary`, `text-muted-foreground`, `rounded-md`, …) consume those
variables, so component files should never hardcode hex values.

## Backend safety

This folder never modifies the backend, migrations, or environment
templates under `../backend/`. All business data flows through the
documented FastAPI endpoints; the frontend only manages the Supabase
user session and forwards the access token as a Bearer header.
