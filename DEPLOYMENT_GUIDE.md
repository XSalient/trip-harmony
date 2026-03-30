# Deploying Harmony Without Manus

This guide explains how to remove all Manus dependencies and deploy Harmony on your own infrastructure (AWS, Vercel, Railway, Render, etc.).

## 1. Authentication System

### Current: Manus OAuth
- **Files involved:** `server/_core/oauth.ts`, `server/_core/context.ts`, `client/src/const.ts`
- **Env vars:** `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`

### Replace with: Auth0, Firebase, or Supabase

**Option A: Auth0**
```bash
npm install @auth0/auth0-react
```
- Update `server/_core/context.ts` to use Auth0 JWT verification
- Update `client/src/const.ts` to use Auth0 login URL
- Set env vars: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`

**Option B: Firebase Authentication**
```bash
npm install firebase firebase-admin
```
- Replace OAuth flow with Firebase Auth in `server/_core/oauth.ts`
- Use Firebase Admin SDK for server-side token verification
- Set env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`

**Option C: Supabase Auth**
```bash
npm install @supabase/supabase-js
```
- Use Supabase's built-in authentication
- Simpler setup with JWT verification out-of-the-box
- Set env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`

## 2. Database

### Current: Manus-hosted MySQL/TiDB
- **Env var:** `DATABASE_URL`

### Replace with: Self-hosted or Cloud Database

**Option A: PostgreSQL (recommended for Drizzle)**
```bash
npm install pg
```
- Update `drizzle.config.ts` to use PostgreSQL driver
- Update connection string format: `postgresql://user:password@host:5432/dbname`
- Providers: AWS RDS, Railway, Render, Heroku, DigitalOcean

**Option B: MySQL/MariaDB**
- Keep current Drizzle setup (already using MySQL driver)
- Providers: AWS RDS, PlanetScale, Railway, Render

**Option C: MongoDB (requires schema rewrite)**
```bash
npm install mongodb mongoose
```
- More work: rewrite Drizzle schema to Mongoose models
- Providers: MongoDB Atlas, AWS DocumentDB

**Steps:**
1. Provision database on your chosen provider
2. Update `DATABASE_URL` env var with new connection string
3. Run migrations: `pnpm drizzle-kit migrate`

## 3. LLM Integration

### Current: Manus built-in LLM
- **Files:** `server/_core/llm.ts`
- **Env vars:** `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`

### Replace with: OpenAI, Anthropic, or Hugging Face

**Option A: OpenAI (easiest)**
```bash
npm install openai
```
- Update `server/_core/llm.ts`:
```typescript
import OpenAI from "openai";

export async function invokeLLM(params: any) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return await client.chat.completions.create({
    model: "gpt-4",
    messages: params.messages,
    temperature: 0.7,
  });
}
```
- Set env var: `OPENAI_API_KEY` (get from https://platform.openai.com)

**Option B: Anthropic Claude**
```bash
npm install @anthropic-ai/sdk
```
- Similar setup to OpenAI
- Set env var: `ANTHROPIC_API_KEY`

**Option C: Local LLM (Ollama)**
- No API key needed
- Set env var: `LLM_API_URL=http://localhost:11434`
- Requires running Ollama locally or on a server

## 4. File Storage (S3)

### Current: Manus S3 proxy
- **Files:** `server/storage.ts`
- **Env vars:** `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`

### Replace with: AWS S3, Cloudinary, or Supabase Storage

**Option A: AWS S3 (recommended)**
```bash
npm install @aws-sdk/client-s3
```
- Already installed in the project
- Update `server/storage.ts` to use real AWS credentials:
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function storagePut(key: string, data: Buffer, contentType?: string) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return { url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}` };
}
```
- Set env vars: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`

**Option B: Cloudinary**
```bash
npm install cloudinary
```
- Simpler setup, handles image optimization automatically
- Set env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

**Option C: Supabase Storage**
- If using Supabase Auth, use their storage too
- Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

## 5. Notifications

### Current: Manus built-in notifications
- **Files:** `server/_core/notification.ts`
- **Env vars:** `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`

### Replace with: SendGrid, Twilio, or Firebase Cloud Messaging

**Option A: SendGrid (Email)**
```bash
npm install @sendgrid/mail
```
- Update `server/_core/notification.ts`:
```typescript
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function notifyOwner({ title, content }: any) {
  try {
    await sgMail.send({
      to: process.env.OWNER_EMAIL!,
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject: title,
      html: content,
    });
    return true;
  } catch (error) {
    console.error("Email notification failed:", error);
    return false;
  }
}
```
- Set env vars: `SENDGRID_API_KEY`, `OWNER_EMAIL`, `SENDGRID_FROM_EMAIL`

**Option B: Twilio (SMS)**
```bash
npm install twilio
```
- Similar setup for SMS notifications

**Option C: Firebase Cloud Messaging (Push)**
```bash
npm install firebase-admin
```
- For mobile/web push notifications

## 6. Deployment Platform

### Option A: Vercel (Recommended for Next.js-like apps)
- Automatically handles environment variables
- Free tier available
- Steps:
  1. Push code to GitHub
  2. Connect GitHub to Vercel
  3. Set environment variables in Vercel dashboard
  4. Deploy

### Option B: Railway
- Simple deployment for full-stack apps
- Steps:
  1. Connect GitHub repo
  2. Add MySQL/PostgreSQL plugin
  3. Set environment variables
  4. Deploy

### Option C: Render
- Similar to Railway
- Good for Node.js + database apps

### Option D: AWS (EC2 + RDS)
- More control, steeper learning curve
- Self-managed infrastructure

### Option E: Docker + Any Cloud
```dockerfile
FROM node:20
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```
- Deploy to: AWS ECS, Google Cloud Run, Azure Container Instances, DigitalOcean App Platform

## 7. Environment Variables Checklist

### Remove (Manus-specific):
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`
- `OAUTH_SERVER_URL`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`
- `OWNER_NAME`
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`

### Add (your own):
- `DATABASE_URL` (update with your database)
- `OPENAI_API_KEY` (or equivalent LLM)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME` (or equivalent storage)
- `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` (or equivalent auth)
- `SENDGRID_API_KEY` (or equivalent notifications)
- `NODE_ENV` (production/development)
- `JWT_SECRET` (keep this for session signing)

## 8. Code Changes Summary

### Files to modify:
1. **`server/_core/oauth.ts`** → Replace with your auth provider
2. **`server/_core/llm.ts`** → Replace with OpenAI/Anthropic
3. **`server/storage.ts`** → Replace with AWS S3/Cloudinary
4. **`server/_core/notification.ts`** → Replace with SendGrid/Twilio
5. **`drizzle.config.ts`** → Update database driver if switching from MySQL
6. **`server/_core/env.ts`** → Update env var names

### Files that stay the same:
- All frontend code (React components)
- Database schema (`drizzle/schema.ts`)
- tRPC routers (`server/routers.ts`)
- Business logic

## 9. Testing Checklist

Before deploying:
- [ ] Authentication works (login/logout)
- [ ] Database reads/writes correctly
- [ ] File uploads work
- [ ] LLM calls succeed (Referee engine)
- [ ] Notifications send
- [ ] All tRPC endpoints respond
- [ ] Frontend loads without errors

## 10. Recommended Stack for Independent Deployment

**Easiest path (minimal setup):**
- **Auth:** Supabase Auth
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage
- **LLM:** OpenAI
- **Notifications:** SendGrid
- **Deployment:** Vercel or Railway

**Why:** Everything integrates well, good documentation, free tiers available.

---

For questions or issues during migration, refer to the official documentation of each service.
