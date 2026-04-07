# Harmony - AI-Powered Group Travel App

## Overview
Harmony is a full-stack web application that helps groups plan trips collaboratively. It resolves group conflicts, finds consensus, and keeps everyone's budget in check.

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS v4 + Radix UI components
- **Backend**: Express.js + tRPC (type-safe API)
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: JWT/cookie-based sessions — email+password and magic link (passwordless)
- **Package Manager**: pnpm

## Project Structure
```
/
├── client/          # React frontend (Vite root)
│   ├── src/         # Source files
│   └── public/      # Static assets
├── server/          # Express backend
│   ├── _core/       # Core server setup (express, vite, trpc, oauth)
│   ├── routers.ts   # tRPC router definitions
│   ├── db.ts        # Database connection + queries
│   └── utils/
│       └── mailer.ts # Email utility (SMTP or console-log fallback)
├── shared/          # Shared types and constants
├── drizzle/         # Database schema
└── vite.config.ts   # Vite configuration
```

## Running the App
- **Dev**: `pnpm run dev` — starts Express + Vite dev server on port 5000 (kills any existing process on port 5000 first)
- **Build**: `pnpm run build` — builds frontend and bundles server
- **Start**: `pnpm run start` — starts production server
- **DB push**: `pnpm db:push` — push schema changes to PostgreSQL

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (Replit-provided)
- `JWT_SECRET` — Secret for signing session cookies (required)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Optional SMTP config for email delivery; if absent, magic links and invite emails are logged to the server console

## Authentication
- **Email + password**: Register/login via the AuthDialog
- **Magic link**: Passwordless sign-in via `/auth/magic/:token`; token is emailed (or logged to console in dev). Tokens expire in 15 minutes.
- Sessions are stored as HTTP-only JWT cookies, valid for 1 year

## Trip Invites
- Each trip has a unique invite code (`/join/:code`)
- Invite dialog: copy link to clipboard, or send via email to a specific address
- The `/join/:code` page is public — unauthenticated users see the trip preview and are prompted to sign in/register, then auto-join after auth

## Replit Configuration
- Runs on port **5000** (required for Replit web preview)
- `allowedHosts: true` in vite.config.ts for Replit proxy compatibility
- Workflow: "Start application" → `pnpm run dev`

## Key Dependencies
- `@trpc/server` + `@trpc/client` — end-to-end type-safe API
- `drizzle-orm` + `pg` — PostgreSQL ORM
- `nodemailer` — email sending
- `wouter` — client-side routing
- `@tanstack/react-query` — server state management
- `framer-motion` — animations
