# Complete Deployment Guide: Supabase + OpenAI + Vercel

This guide provides **all data, steps, prompts, variables, and values** needed to deploy Harmony independently.

---

## Phase 1: Supabase Setup (Auth + Database + Storage)

### Step 1.1: Create Supabase Project

**URL:** https://supabase.com

**Steps:**
1. Click "Start your project"
2. Sign up or log in
3. Click "New project"
4. Fill in:
   - **Project name:** `harmony-trip-planner` (or your choice)
   - **Database password:** Generate a strong password (save this!)
   - **Region:** Choose closest to your users (e.g., `us-east-1`)
5. Click "Create new project"
6. Wait 2-3 minutes for provisioning

**After creation, you'll get:**
- **Project URL:** `https://[project-id].supabase.co`
- **Anon Key:** (public, safe to expose in frontend)
- **Service Role Key:** (secret, keep on server only)

### Step 1.2: Get Supabase Credentials

**In Supabase Dashboard:**
1. Go to **Settings** → **API**
2. Copy and save these values:
   ```
   SUPABASE_URL=https://[project-id].supabase.co
   SUPABASE_ANON_KEY=[your-anon-key]
   SUPABASE_SERVICE_KEY=[your-service-role-key]
   ```

### Step 1.3: Migrate Database Schema

**In your local project:**

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link to your Supabase project:
   ```bash
   supabase link --project-ref [project-id]
   ```

3. Update `drizzle.config.ts` to use PostgreSQL:
   ```typescript
   import type { Config } from "drizzle-kit";

   export default {
     schema: "./drizzle/schema.ts",
     out: "./drizzle",
     driver: "pg",
     dbCredentials: {
       connectionString: process.env.DATABASE_URL || "",
     },
   } satisfies Config;
   ```

4. Update `package.json` dependencies:
   ```bash
   npm uninstall mysql2
   npm install pg
   ```

5. Update `server/db.ts` to use PostgreSQL:
   ```typescript
   import { drizzle } from "drizzle-orm/postgres-js";
   import postgres from "postgres";

   let _db: ReturnType<typeof drizzle> | null = null;

   export async function getDb() {
     if (!_db && process.env.DATABASE_URL) {
       try {
         const client = postgres(process.env.DATABASE_URL);
         _db = drizzle(client);
       } catch (error) {
         console.warn("[Database] Failed to connect:", error);
         _db = null;
       }
     }
     return _db;
   }
   ```

6. Generate migration from schema:
   ```bash
   pnpm drizzle-kit generate
   ```

7. Push to Supabase:
   ```bash
   DATABASE_URL="postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres" \
   pnpm drizzle-kit migrate
   ```

   Replace:
   - `[password]` with your database password from Step 1.1
   - `[project-id]` with your Supabase project ID

### Step 1.4: Enable Supabase Auth

**In Supabase Dashboard:**
1. Go to **Authentication** → **Providers**
2. Enable "Email" (default, already enabled)
3. Go to **URL Configuration**
4. Add redirect URLs:
   ```
   http://localhost:3000/api/oauth/callback
   https://[your-vercel-domain].vercel.app/api/oauth/callback
   ```

### Step 1.5: Set Up Storage Bucket

**In Supabase Dashboard:**
1. Go to **Storage**
2. Click "Create a new bucket"
3. Name: `harmony-files`
4. Make it **Public** (so files are accessible)
5. Click "Create bucket"

---

## Phase 2: OpenAI Setup

### Step 2.1: Create OpenAI Account

**URL:** https://platform.openai.com

**Steps:**
1. Sign up or log in
2. Go to **API keys** section
3. Click "Create new secret key"
4. Copy and save:
   ```
   OPENAI_API_KEY=sk-[your-key]
   ```

### Step 2.2: Set Up Billing

**In OpenAI Dashboard:**
1. Go to **Billing** → **Overview**
2. Add payment method (credit card)
3. Set usage limits (optional but recommended)
   - Go to **Billing** → **Usage limits**
   - Set monthly limit to $50 or your preference

**Cost estimate for Harmony:**
- Travel DNA quiz analysis: ~$0.001 per analysis
- Referee engine: ~$0.01 per analysis
- Natural language parsing: ~$0.001 per proposal
- Estimated monthly cost: $5-20 depending on usage

---

## Phase 3: Code Updates

### Step 3.1: Update Authentication

**File: `server/_core/oauth.ts`**

Replace entire file with:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function handleOAuthCallback(req: Request, res: Response) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "No authorization code" });
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code as string
    );

    if (error || !data.session) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // Set session cookie
    res.cookie("session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Redirect to home
    const returnPath = req.query.state || "/";
    res.redirect(returnPath as string);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export function getLoginUrl(returnPath = "/") {
  const { data } = supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.VERCEL_URL || "http://localhost:3000"}/api/oauth/callback?state=${encodeURIComponent(returnPath)}`,
    },
  });

  return data?.url || "";
}
```

**File: `server/_core/context.ts`**

Replace with:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function createContext(req: Request, res: Response) {
  const token = req.cookies.session;

  let user = null;

  if (token) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        user = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email,
          role: "user",
        };
      }
    } catch (error) {
      console.error("Auth error:", error);
    }
  }

  return { user, req, res };
}
```

### Step 3.2: Update LLM Integration

**File: `server/_core/llm.ts`**

Replace entire file with:
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function invokeLLM(params: {
  messages: Array<{ role: string; content: string }>;
  response_format?: any;
}) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: params.messages as any,
      temperature: 0.7,
      max_tokens: 1000,
      response_format: params.response_format,
    });

    return response;
  } catch (error) {
    console.error("LLM error:", error);
    throw error;
  }
}
```

Install OpenAI SDK:
```bash
npm install openai
```

### Step 3.3: Update File Storage

**File: `server/storage.ts`**

Replace entire file with:
```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
) {
  try {
    const { data: uploadData, error } = await supabase.storage
      .from("harmony-files")
      .upload(relKey, data, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    const { data: publicData } = supabase.storage
      .from("harmony-files")
      .getPublicUrl(relKey);

    return {
      key: uploadData.path,
      url: publicData.publicUrl,
    };
  } catch (error) {
    console.error("Storage error:", error);
    throw error;
  }
}

export async function storageGet(relKey: string, expiresIn = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from("harmony-files")
      .createSignedUrl(relKey, expiresIn);

    if (error) throw error;

    return {
      key: relKey,
      url: data.signedUrl,
    };
  } catch (error) {
    console.error("Storage get error:", error);
    throw error;
  }
}
```

### Step 3.4: Update Notifications (Optional)

**File: `server/_core/notification.ts`**

For now, you can skip this or use a simple email service. If you want to keep notifications:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function notifyOwner({ title, content }: any) {
  // Store in database instead of sending email
  // You can add email later with SendGrid
  console.log(`[Notification] ${title}: ${content}`);
  return true;
}
```

### Step 3.5: Update Environment Variables

**File: `.env.local` (for local development)**

```env
# Database
DATABASE_URL=postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres

# Supabase
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-role-key]

# OpenAI
OPENAI_API_KEY=sk-[your-key]

# Session
JWT_SECRET=[generate-random-string-32-chars]

# App
NODE_ENV=development
```

To generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Phase 4: Vercel Deployment

### Step 4.1: Prepare GitHub Repository

**Steps:**
1. Ensure your code is pushed to GitHub
2. Make sure `vercel.json` exists in root:
   ```json
   {
     "buildCommand": "pnpm build",
     "outputDirectory": "dist",
     "framework": null,
     "functions": {
       "api/**/*.ts": {
         "runtime": "nodejs20.x"
       }
     },
     "rewrites": [
       {
         "source": "/api/(.*)",
         "destination": "/api/$1"
       },
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

### Step 4.2: Create Vercel Project

**URL:** https://vercel.com

**Steps:**
1. Sign up or log in
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Click "Import"

### Step 4.3: Set Environment Variables

**In Vercel Dashboard:**
1. Go to your project
2. Click "Settings" → "Environment Variables"
3. Add each variable:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres` | Production, Preview, Development |
| `SUPABASE_URL` | `https://[project-id].supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | Your anon key | Production, Preview, Development |
| `SUPABASE_SERVICE_KEY` | Your service role key | Production only |
| `OPENAI_API_KEY` | `sk-[your-key]` | Production only |
| `JWT_SECRET` | Your generated secret | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |

**Important:** Service keys should ONLY be in Production environment.

### Step 4.4: Deploy

**Steps:**
1. Click "Deploy"
2. Wait for build to complete (5-10 minutes)
3. Once complete, you'll get a URL: `https://[your-project].vercel.app`

### Step 4.5: Update Supabase Redirect URLs

**Back in Supabase Dashboard:**
1. Go to **Authentication** → **URL Configuration**
2. Add your Vercel URL:
   ```
   https://[your-project].vercel.app/api/oauth/callback
   ```

---

## Phase 5: Testing & Verification

### Checklist:

- [ ] **Database:** Can you see tables in Supabase dashboard?
- [ ] **Authentication:** Can you log in on Vercel URL?
- [ ] **Storage:** Can you upload files (accommodation images)?
- [ ] **LLM:** Does Referee engine work?
- [ ] **API:** Do all tRPC endpoints respond?
- [ ] **Frontend:** Does the app load without errors?

### Test Commands:

```bash
# Test database connection
DATABASE_URL="postgresql://..." pnpm drizzle-kit migrate

# Test locally before deploying
pnpm dev

# Check build
pnpm build
```

---

## Phase 6: Custom Domain (Optional)

### Step 6.1: Add Domain to Vercel

**In Vercel Dashboard:**
1. Go to **Settings** → **Domains**
2. Enter your domain (e.g., `harmony.example.com`)
3. Follow DNS configuration steps

### Step 6.2: Update DNS

**At your domain registrar (GoDaddy, Namecheap, etc.):**
1. Add CNAME record pointing to Vercel
2. Wait 24-48 hours for DNS propagation

---

## Complete Environment Variables Reference

### Development (`.env.local`)
```env
DATABASE_URL=postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-role-key]
OPENAI_API_KEY=sk-[your-key]
JWT_SECRET=[random-32-char-string]
NODE_ENV=development
```

### Production (Vercel)
```
DATABASE_URL=postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-role-key]
OPENAI_API_KEY=sk-[your-key]
JWT_SECRET=[random-32-char-string]
NODE_ENV=production
```

---

## Troubleshooting

### Issue: "DATABASE_URL not set"
**Solution:** Check Vercel environment variables are set correctly

### Issue: "Authentication fails"
**Solution:** Ensure Supabase redirect URLs include your Vercel domain

### Issue: "LLM calls timeout"
**Solution:** Check OpenAI API key is valid and has credits

### Issue: "Storage upload fails"
**Solution:** Ensure `harmony-files` bucket exists and is public

### Issue: "Build fails on Vercel"
**Solution:** 
1. Check logs in Vercel dashboard
2. Run `pnpm build` locally to reproduce
3. Ensure all dependencies are in `package.json`

---

## Cost Breakdown (Monthly Estimates)

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Supabase** | 500MB DB, 1GB storage | $25+/month |
| **OpenAI** | $5 free credits | $0.01-0.10 per 1K tokens |
| **Vercel** | 100GB bandwidth | $20+/month |
| **Total** | Free | $30-50/month |

---

## Next Steps

1. **Immediate:** Follow Phase 1-4 above
2. **Testing:** Run through Phase 5 checklist
3. **Production:** Monitor logs in Vercel and Supabase dashboards
4. **Scaling:** Add SendGrid for email notifications when needed
5. **Analytics:** Add Vercel Analytics for performance monitoring

---

## Support Resources

- **Supabase Docs:** https://supabase.com/docs
- **OpenAI Docs:** https://platform.openai.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **Drizzle Docs:** https://orm.drizzle.team

---

**You're all set! Deploy with confidence. 🚀**
