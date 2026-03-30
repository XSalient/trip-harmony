# Harmony Deployment Checklist: Supabase + OpenAI + Vercel

## Phase 1: Supabase Setup ⚙️

### Create Project
- [ ] Go to https://supabase.com
- [ ] Create new project named `harmony-trip-planner`
- [ ] Save database password securely
- [ ] Wait for provisioning (2-3 minutes)

### Get Credentials
- [ ] Go to Settings → API
- [ ] Copy `SUPABASE_URL`
- [ ] Copy `SUPABASE_ANON_KEY`
- [ ] Copy `SUPABASE_SERVICE_KEY`
- [ ] Save all three in a secure location

### Migrate Database
- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Link project: `supabase link --project-ref [project-id]`
- [ ] Update `drizzle.config.ts` (see guide)
- [ ] Update `server/db.ts` (see guide)
- [ ] Install postgres: `npm install pg`
- [ ] Generate migration: `pnpm drizzle-kit generate`
- [ ] Push to Supabase: `DATABASE_URL="..." pnpm drizzle-kit migrate`

### Configure Auth
- [ ] Go to Authentication → Providers
- [ ] Ensure Email is enabled
- [ ] Go to URL Configuration
- [ ] Add redirect URL: `http://localhost:3000/api/oauth/callback`
- [ ] Add redirect URL: `https://[your-vercel-domain].vercel.app/api/oauth/callback`

### Create Storage Bucket
- [ ] Go to Storage
- [ ] Create bucket named `harmony-files`
- [ ] Make it Public
- [ ] Confirm creation

**Supabase Credentials to Save:**
```
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[copy-from-api-section]
SUPABASE_SERVICE_KEY=[copy-from-api-section]
DATABASE_URL=postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres
```

---

## Phase 2: OpenAI Setup 🤖

### Create Account
- [ ] Go to https://platform.openai.com
- [ ] Sign up or log in
- [ ] Go to API keys section
- [ ] Create new secret key
- [ ] Copy and save: `OPENAI_API_KEY=sk-...`

### Set Up Billing
- [ ] Go to Billing → Overview
- [ ] Add payment method
- [ ] Go to Billing → Usage limits
- [ ] Set monthly limit (recommended: $50)

**OpenAI Credentials to Save:**
```
OPENAI_API_KEY=sk-[your-key]
```

---

## Phase 3: Code Updates 💻

### Update Authentication
- [ ] Replace `server/_core/oauth.ts` (see guide)
- [ ] Replace `server/_core/context.ts` (see guide)

### Update LLM
- [ ] Install OpenAI: `npm install openai`
- [ ] Replace `server/_core/llm.ts` (see guide)

### Update Storage
- [ ] Replace `server/storage.ts` (see guide)

### Update Notifications (Optional)
- [ ] Replace `server/_core/notification.ts` (see guide)

### Update Environment Variables
- [ ] Create `.env.local` with all variables (see guide)
- [ ] Generate JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Environment Variables to Create:**
```
DATABASE_URL=postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-role-key]
OPENAI_API_KEY=sk-[your-key]
JWT_SECRET=[generated-32-char-string]
NODE_ENV=development
```

### Test Locally
- [ ] Run `pnpm dev`
- [ ] Test login
- [ ] Test database operations
- [ ] Test file upload
- [ ] Test Referee engine (LLM)
- [ ] Run `pnpm build` to check for errors

---

## Phase 4: Vercel Deployment 🚀

### Prepare Repository
- [ ] Push all code to GitHub
- [ ] Verify `vercel.json` exists in root
- [ ] Check `package.json` has all dependencies

### Create Vercel Project
- [ ] Go to https://vercel.com
- [ ] Sign up or log in
- [ ] Click "Add New" → "Project"
- [ ] Import GitHub repository
- [ ] Click "Import"

### Set Environment Variables
In Vercel Dashboard → Settings → Environment Variables, add:

| Variable | Value | Environments |
|----------|-------|--------------|
| `DATABASE_URL` | `postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres` | Production, Preview, Development |
| `SUPABASE_URL` | `https://[project-id].supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | [your-anon-key] | Production, Preview, Development |
| `SUPABASE_SERVICE_KEY` | [your-service-role-key] | Production only |
| `OPENAI_API_KEY` | `sk-[your-key]` | Production only |
| `JWT_SECRET` | [generated-string] | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |

**Steps:**
- [ ] Click "Settings"
- [ ] Click "Environment Variables"
- [ ] Add each variable above
- [ ] Make sure to select correct environments
- [ ] Save each one

### Deploy
- [ ] Click "Deploy" button
- [ ] Wait for build to complete (5-10 minutes)
- [ ] Check build logs for errors
- [ ] Once complete, note your Vercel URL: `https://[your-project].vercel.app`

### Update Supabase Redirect URLs
- [ ] Go back to Supabase Dashboard
- [ ] Go to Authentication → URL Configuration
- [ ] Add new redirect URL: `https://[your-project].vercel.app/api/oauth/callback`
- [ ] Save

---

## Phase 5: Testing & Verification ✅

### Database
- [ ] Can you see tables in Supabase dashboard? (Go to SQL Editor)
- [ ] Run test query: `SELECT COUNT(*) FROM users;`

### Authentication
- [ ] Visit your Vercel URL
- [ ] Click "Get Started"
- [ ] Can you log in?
- [ ] Are you redirected to home?
- [ ] Can you log out?

### Storage
- [ ] Create a trip
- [ ] Try to upload an accommodation image
- [ ] Does it upload successfully?
- [ ] Can you see it in Supabase Storage?

### LLM
- [ ] Complete Travel DNA quiz
- [ ] Go to Referee page
- [ ] Click "Get Referee Analysis"
- [ ] Does it generate a response?

### API
- [ ] Open browser DevTools → Network tab
- [ ] Perform actions (create trip, vote, etc.)
- [ ] Do API calls succeed (200 status)?
- [ ] Check for errors in Console tab

### Frontend
- [ ] Does app load without errors?
- [ ] Can you navigate between pages?
- [ ] Are all buttons clickable?
- [ ] Do forms work?

**Test Checklist:**
- [ ] Login/Logout works
- [ ] Create trip works
- [ ] Invite members works
- [ ] Travel DNA quiz works
- [ ] Date proposals work
- [ ] Destination voting works
- [ ] Accommodation voting works
- [ ] Budget tracking works
- [ ] Referee engine works
- [ ] Notifications appear

---

## Phase 6: Custom Domain (Optional) 🌐

### Add Domain to Vercel
- [ ] Go to Vercel Dashboard
- [ ] Go to Settings → Domains
- [ ] Enter your domain (e.g., `harmony.example.com`)
- [ ] Follow DNS configuration steps

### Update DNS at Registrar
- [ ] Log in to your domain registrar (GoDaddy, Namecheap, etc.)
- [ ] Find DNS settings
- [ ] Add CNAME record pointing to Vercel
- [ ] Wait 24-48 hours for propagation

---

## Credentials Vault 🔐

**Save these securely (use a password manager):**

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
DATABASE_URL=
OPENAI_API_KEY=
JWT_SECRET=
VERCEL_URL=
CUSTOM_DOMAIN=
```

---

## Troubleshooting 🔧

| Issue | Solution |
|-------|----------|
| Build fails on Vercel | Check logs, run `pnpm build` locally |
| Database connection error | Verify DATABASE_URL format and IP whitelist in Supabase |
| Auth fails | Check Supabase redirect URLs are correct |
| LLM timeout | Verify OpenAI API key and billing setup |
| Storage upload fails | Check `harmony-files` bucket exists and is public |
| Blank page on Vercel | Check browser console for errors, check Vercel logs |

---

## Cost Summary 💰

| Service | Free Tier | Estimated Monthly |
|---------|-----------|-------------------|
| Supabase | 500MB DB, 1GB storage | $0-25 |
| OpenAI | $5 credits | $10-30 |
| Vercel | 100GB bandwidth | $0-20 |
| **Total** | Free | **$10-75** |

---

## Success! 🎉

Once all checkboxes are complete, your Harmony app is live and independent from Manus!

**Next steps:**
1. Monitor Vercel and Supabase dashboards
2. Share your Vercel URL with users
3. Add custom domain when ready
4. Scale infrastructure as needed

**Support:**
- Supabase Issues: https://supabase.com/docs
- OpenAI Issues: https://platform.openai.com/docs
- Vercel Issues: https://vercel.com/docs
