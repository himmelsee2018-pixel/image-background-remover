# BGRemover – Deploy Guide

## Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account (already configured: `a313c3342ac554acbbce04eafd257530`)

---

## Step 1 – Login to Cloudflare
```bash
wrangler login
```

---

## Step 2 – Create D1 Database
```bash
wrangler d1 create bgremover-db
```
Copy the `database_id` from the output and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml`.

---

## Step 3 – Run Database Migrations
```bash
# Local test
wrangler d1 execute bgremover-db --local --file=schema.sql

# Production
wrangler d1 execute bgremover-db --file=schema.sql
```

---

## Step 4 – Set Secret Environment Variables
```bash
wrangler secret put PAYPAL_CLIENT_ID
# Paste: AZia4eoePw0q9ruwj6WQQSvzYsKSfnvAV1cDnmehyUz9-Y1ndgSRIocnhaJ_oC7L7xFDBFQvlfs6KGQF

wrangler secret put PAYPAL_CLIENT_SECRET
# Paste: ECpPHdSU0l0lT5AmLpposjEnzZF-InBkWM-juWj97CSJhafNaCyDfpvObLuARJzFL03hbhy_WyRkiiLn
```

---

## Step 5 – Deploy Worker
```bash
wrangler deploy
```
Note the Worker URL (e.g. `https://bgremover-api.xxxxx.workers.dev`)
Update `API_BASE` in `app.js` and `pricing.html` if different.

---

## Step 6 – Deploy Frontend to Cloudflare Pages
```bash
# In the repo root:
wrangler pages deploy . --project-name=bgremover
```
Or connect GitHub repo to Cloudflare Pages dashboard for auto-deploy on push.

---

## Step 7 – Switch to PayPal Live (when ready)
1. In `wrangler.toml`, change `PAYPAL_BASE_URL` to `https://api-m.paypal.com`
2. Replace the `client-id` in `pricing.html` PayPal SDK script tag with your **Live** Client ID
3. Run `wrangler secret put PAYPAL_CLIENT_ID` and `wrangler secret put PAYPAL_CLIENT_SECRET` with Live keys
4. Redeploy: `wrangler deploy`

---

## File Structure
```
├── index.html       # Main app (upload + remove bg)
├── pricing.html     # Pricing page with PayPal buttons
├── app.js           # Frontend logic + credit system
├── style.css        # All styles
├── worker.js        # Cloudflare Worker (PayPal API + D1)
├── wrangler.toml    # Worker config
├── schema.sql       # D1 database schema
└── DEPLOY.md        # This file
```

---

## API Endpoints (Worker)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Google login, upsert user |
| GET  | `/api/user/credits` | Get current credits |
| POST | `/api/process` | Deduct 1 credit after processing |
| POST | `/api/paypal/create-order` | Create PayPal order |
| POST | `/api/paypal/capture-order` | Capture payment & add credits |
| GET  | `/api/user/history` | Get processing history |
