# Harmony - AI-Powered Group Travel App

## Overview
Harmony is a full-stack web application that helps groups plan trips collaboratively. It resolves group conflicts, finds consensus, and keeps everyone's budget in check.

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS v4 + Radix UI components
- **Backend**: Express.js + tRPC (type-safe API)
- **Database**: MySQL via Drizzle ORM
- **Auth**: JWT/cookie-based sessions with OAuth support
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
│   ├── db.ts        # Database connection
│   └── storage.ts   # Storage abstraction
├── shared/          # Shared types and constants
├── drizzle/         # Database schema and migrations
└── vite.config.ts   # Vite configuration
```

## Running the App
- **Dev**: `pnpm run dev` — starts Express + Vite dev server on port 5000
- **Build**: `pnpm run build` — builds frontend and bundles server
- **Start**: `pnpm run start` — starts production server

## Environment Variables
- `DATABASE_URL` — MySQL connection string (required)
- `JWT_SECRET` — Secret for signing session cookies
- `OAUTH_SERVER_URL` — OAuth provider base URL (optional)
- `VITE_APP_ID` — App identifier for OAuth
- `OWNER_OPEN_ID` — Owner's OpenID for admin access

## Replit Configuration
- Runs on port **5000** (required for Replit web preview)
- `allowedHosts: true` in vite.config.ts for Replit proxy compatibility
- Workflow: "Start application" → `pnpm run dev`

## Key Dependencies
- `@trpc/server` + `@trpc/client` — end-to-end type-safe API
- `drizzle-orm` + `mysql2` — database ORM
- `wouter` — client-side routing
- `@tanstack/react-query` — server state management
- `framer-motion` — animations
- `next-themes` — dark/light mode
