# Clerk And ngrok Setup Reference

This reference is for setting up Clerk auth and Clerk webhooks from a different machine, a different Clerk account, or a different ngrok account.

It focuses on values and dashboard setup that are not fully captured by the codebase.

## What The Codebase Already Contains

The repository should already contain:

- Clerk installed with `@clerk/nextjs`.
- `ClerkProvider` in `app/layout.tsx`.
- Clerk signed-in/signed-out UI in `app/page.tsx`.
- `UserButton` in `components/notebook/NotebookSidebar.tsx`.
- Clerk route protection in `proxy.ts`.
- Clerk user mapping in `lib/server/current-user.ts`.
- User upsert logic in `lib/server/user-repository.ts`.
- A `users.clerk_user_id` database column.
- Webhook-related columns:
  - `image_url`
  - `deleted_at`
  - `clerk_synced_at`

The repository should also contain `.env.example` with placeholders:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

Do not put real secrets in `.env.example`.

## Local Files That Must Be Recreated

On a new machine, create:

```text
note-taking-app/.env.local
```

This file should contain real local/development values:

```env
DATABASE_URL="real_neon_database_url"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="real_clerk_publishable_key"
CLERK_SECRET_KEY="real_clerk_secret_key"
CLERK_WEBHOOK_SIGNING_SECRET="real_clerk_webhook_signing_secret"
```

`.env.local` should stay ignored by Git.

After changing `.env.local`, restart the dev server.

## Clerk Auth Setup

### 1. Create Or Select A Clerk App

Go to:

```text
https://dashboard.clerk.com
```

Create or select the Clerk application for this project.

Make sure you know whether you are working in:

```text
Development
Production
```

These environments have different keys.

### 2. Copy Clerk API Keys

In the Clerk Dashboard, find the API keys for the selected environment.

Copy:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

Add them to `.env.local`.

For Vercel, add them to:

```text
Project Settings
  -> Environment Variables
```

Use production Clerk keys for production deployments.

### 3. Restart Or Redeploy

Local:

```text
restart pnpm dev
```

Vercel:

```text
redeploy after changing environment variables
```

Environment variable changes do not automatically update an already-built deployment.

## ngrok Setup For Local Webhook Testing

ngrok lets Clerk send webhook requests to your local machine.

Official docs:

```text
https://ngrok.com/docs/getting-started
```

### 1. Create An ngrok Account

Go to:

```text
https://dashboard.ngrok.com/signup
```

Create an account or sign in.

### 2. Install ngrok

On Windows, use one of:

- Microsoft Store install
- direct download from ngrok

Check that it works:

```powershell
ngrok help
```

### 3. Add Your ngrok Auth Token

In the ngrok dashboard, copy your auth token.

Then run:

```powershell
ngrok config add-authtoken YOUR_NGROK_AUTH_TOKEN
```

This only needs to be done once per machine/account.

### 4. Start The Next.js Dev Server

In one terminal:

```powershell
cd note-taking-app
pnpm dev
```

The app should run at:

```text
http://localhost:3000
```

### 5. Start ngrok

In a second terminal:

```powershell
ngrok http 3000
```

ngrok will print a forwarding URL like:

```text
https://abc123.ngrok-free.app
```

Keep this terminal open while testing webhooks.

### 6. Build The Local Webhook URL

If the ngrok URL is:

```text
https://abc123.ngrok-free.app
```

then the Clerk webhook endpoint should be:

```text
https://abc123.ngrok-free.app/api/webhooks/clerk
```

## Clerk Webhook Endpoint Setup

Official Clerk guide:

```text
https://clerk.com/docs/guides/development/webhooks/syncing
```

### 1. Add A Webhook Endpoint

In the Clerk Dashboard:

```text
Webhooks
  -> Add Endpoint
```

For local testing, use the ngrok URL:

```text
https://abc123.ngrok-free.app/api/webhooks/clerk
```

For production, use the deployed app URL:

```text
https://note-taking-app-mu-bice.vercel.app/api/webhooks/clerk
```

### 2. Subscribe To Events

Recommended starting events:

```text
user.created
user.updated
user.deleted
```

Start with only the events the app actually handles.

### 3. Copy The Signing Secret

After creating the endpoint, open the endpoint settings page.

Find:

```text
Signing Secret
```

Reveal it if needed and copy it.

It should look like:

```text
whsec_...
```

Add it to `.env.local`:

```env
CLERK_WEBHOOK_SIGNING_SECRET=whsec_real_value
```

Important:

```text
Development and production webhook endpoints usually have different signing secrets.
```

Do not reuse a development webhook secret in production unless it truly belongs to the production endpoint.

## Vercel Production Setup

For the deployed app, Vercel needs:

```text
DATABASE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
```

Add these in:

```text
Vercel Project
  -> Settings
    -> Environment Variables
```

Use the production Clerk app's values.

After adding or changing values:

```text
redeploy the Vercel app
```

## Common Issues

### App Returns Internal Server Error On Vercel

Likely causes:

```text
missing Clerk env vars
missing DATABASE_URL
env vars added but deployment not redeployed
wrong Clerk environment keys
```

Fix:

```text
check Vercel env vars
redeploy
check Vercel runtime logs
```

### Webhook Fails Locally

Likely causes:

```text
pnpm dev is not running
ngrok is not running
wrong ngrok URL in Clerk
webhook route does not exist yet
webhook route is protected by proxy.ts
wrong CLERK_WEBHOOK_SIGNING_SECRET
dev server not restarted after editing .env.local
```

### Clerk Cannot Reach The Webhook Route

Check:

```text
ngrok terminal is open
endpoint URL includes /api/webhooks/clerk
proxy.ts does not require browser auth for webhook route
```

### Signature Verification Fails

Check:

```text
CLERK_WEBHOOK_SIGNING_SECRET matches the exact Clerk endpoint
using development secret for local endpoint
using production secret for deployed endpoint
dev server restarted after .env.local change
```

## Quick Setup Checklist

On a new machine:

```text
1. Clone repo.
2. Install dependencies with pnpm install.
3. Create .env.local.
4. Add DATABASE_URL.
5. Add Clerk publishable key.
6. Add Clerk secret key.
7. Install ngrok.
8. Add ngrok auth token.
9. Start pnpm dev.
10. Start ngrok http 3000.
11. Create Clerk webhook endpoint with ngrok URL.
12. Copy webhook signing secret.
13. Add CLERK_WEBHOOK_SIGNING_SECRET to .env.local.
14. Restart pnpm dev.
15. Send Clerk webhook test event.
```

For production:

```text
1. Add production Clerk keys to Vercel.
2. Add DATABASE_URL to Vercel.
3. Create production Clerk webhook endpoint.
4. Add production CLERK_WEBHOOK_SIGNING_SECRET to Vercel.
5. Redeploy.
6. Send test event from Clerk Dashboard.
7. Check Vercel logs and Neon database.
```
