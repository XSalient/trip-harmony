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

## Features
- **Trip Dashboard** — overview of all planning sections with voting summaries, comment counts, and edit/clone/delete actions
- **Date Proposals** — propose & vote on date ranges with optimistic UI updates and unvote support
- **Destinations** — suggest destinations with vibe tags, images, voting (Yes/Maybe/No), and comments
- **Accommodations** — add stays with parsed details (bedrooms, bathrooms, price), comfort scoring, voting, and comments
- **Vibe Board** — inspiration board for sharing links, photos, and ideas with Love/Maybe/No voting (PRD Module 4)
- **Itinerary Builder** — day-by-day planner with typed activity items, time, location, cost, and links (PRD Module 9)
- **Budget Tracker** — log and split expenses across categories
- **AI Referee** — AI-powered mediation and trip suggestions
- **Comments** — comment threads on each proposal with count badges across all views
- **Optimistic Voting** — all votes update instantly in the UI without waiting for server; clicking same vote removes it (unvote)
- **Clone & Edit** — clone any proposal pre-filled into the add dialog for easy variations

## DB Tables
- `users`, `travel_dna`, `trips`, `trip_members`
- `date_proposals`, `date_votes`
- `destinations`, `destination_votes`
- `accommodations`, `accommodation_votes`, `accommodation_attributes`
- `budget_items`, `referee_messages`, `notifications`
- `proposal_comments`
- `vibe_items`, `vibe_votes` (Vibe Board)
- `itinerary_days`, `itinerary_items` (Itinerary)
- `magic_link_tokens`

## Key Dependencies
- `@trpc/server` + `@trpc/client` — end-to-end type-safe API
- `drizzle-orm` + `pg` — PostgreSQL ORM
- `nodemailer` — email sending
- `wouter` — client-side routing
- `@tanstack/react-query` — server state management
- `framer-motion` — animations
