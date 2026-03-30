# Quick Reference: Supabase + OpenAI + Vercel Deployment

## 🎯 At a Glance

**Total Setup Time:** 1-2 hours  
**Difficulty:** Intermediate  
**Cost:** Free to $75/month  

---

## 📋 Critical Values to Collect

### From Supabase (Settings → API)
```
SUPABASE_URL = https://[project-id].supabase.co
SUPABASE_ANON_KEY = eyJhbGc...
SUPABASE_SERVICE_KEY = eyJhbGc...
DATABASE_URL = postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres
```

### From OpenAI (API Keys)
```
OPENAI_API_KEY = sk-proj-...
```

### Generated
```
JWT_SECRET = [run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"]
```

---

## 🚀 Quick Steps

### 1. Supabase (15 min)
```bash
# Create project at https://supabase.com
# Copy credentials from Settings → API
# Run migration:
DATABASE_URL="postgresql://postgres:[password]@[id].supabase.co:5432/postgres" \
pnpm drizzle-kit migrate
```

### 2. OpenAI (5 min)
```bash
# Get API key from https://platform.openai.com/api-keys
# Add payment method in Billing section
```

### 3. Code Updates (20 min)
```bash
# Install dependencies
npm install pg openai

# Update files (see DEPLOYMENT_SUPABASE_OPENAI_VERCEL.md):
# - server/_core/oauth.ts
# - server/_core/context.ts
# - server/_core/llm.ts
# - server/storage.ts
# - drizzle.config.ts
# - server/db.ts

# Test locally
pnpm dev
pnpm build
```

### 4. Vercel (10 min)
```bash
# Push to GitHub
git push origin main

# At https://vercel.com:
# 1. Create new project from GitHub
# 2. Add environment variables (see table below)
# 3. Click Deploy
```

### 5. Update Supabase URLs (2 min)
```
# In Supabase → Authentication → URL Configuration
# Add: https://[your-project].vercel.app/api/oauth/callback
```

---

## 🔑 Environment Variables for Vercel

**Copy-paste this table into Vercel Settings → Environment Variables:**

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://postgres:[PASSWORD]@[PROJECT-ID].supabase.co:5432/postgres` | All |
| `SUPABASE_URL` | `https://[PROJECT-ID].supabase.co` | All |
| `SUPABASE_ANON_KEY` | (from Supabase API) | All |
| `SUPABASE_SERVICE_KEY` | (from Supabase API) | Production only |
| `OPENAI_API_KEY` | `sk-proj-...` | Production only |
| `JWT_SECRET` | (generated string) | All |
| `NODE_ENV` | `production` | Production |

**Replace placeholders:**
- `[PASSWORD]` = Database password from Supabase
- `[PROJECT-ID]` = Your Supabase project ID
- Other values = Copy from respective dashboards

---

## 📝 Code Changes Summary

### File: `drizzle.config.ts`
```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  driver: "pg",  // Changed from "mysql2"
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || "",
  },
} satisfies Config;
```

### File: `server/db.ts` (first 35 lines)
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

### File: `server/_core/llm.ts`
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function invokeLLM(params: any) {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: params.messages as any,
    temperature: 0.7,
    max_tokens: 1000,
    response_format: params.response_format,
  });
  return response;
}
```

### File: `server/storage.ts` (key functions)
```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function storagePut(relKey: string, data: any, contentType?: string) {
  const { data: uploadData, error } = await supabase.storage
    .from("harmony-files")
    .upload(relKey, data, { contentType, upsert: true });
  if (error) throw error;
  const { data: publicData } = supabase.storage
    .from("harmony-files")
    .getPublicUrl(relKey);
  return { key: uploadData.path, url: publicData.publicUrl };
}
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] **Database:** Can query tables in Supabase SQL Editor
- [ ] **Auth:** Can log in on Vercel URL
- [ ] **Storage:** Can upload images
- [ ] **LLM:** Referee engine generates responses
- [ ] **API:** All tRPC endpoints respond
- [ ] **Frontend:** No console errors

---

## 🔗 Useful URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Supabase | https://supabase.com | Database, Auth, Storage |
| OpenAI | https://platform.openai.com | LLM API |
| Vercel | https://vercel.com | Deployment |
| GitHub | https://github.com | Code repository |
| Your App | `https://[project].vercel.app` | Live app |

---

## 💡 Pro Tips

1. **Save credentials in password manager** (1Password, LastPass, etc.)
2. **Set OpenAI usage limits** to avoid surprise bills
3. **Monitor Vercel logs** for deployment issues
4. **Test locally first** before pushing to Vercel
5. **Use Supabase dashboard** to inspect database
6. **Enable Vercel analytics** to track performance

---

## 🚨 Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `DATABASE_URL not set` | Add to Vercel env vars |
| `Auth fails` | Check Supabase redirect URLs |
| `LLM timeout` | Verify OpenAI API key and billing |
| `Build fails` | Run `pnpm build` locally to debug |
| `Storage 404` | Ensure `harmony-files` bucket is public |
| `Blank page` | Check browser console and Vercel logs |

---

## 📞 Support

- **Supabase:** https://supabase.com/docs
- **OpenAI:** https://platform.openai.com/docs
- **Vercel:** https://vercel.com/docs
- **Drizzle:** https://orm.drizzle.team/docs

---

**Ready? Start with Supabase setup above! 🚀**
