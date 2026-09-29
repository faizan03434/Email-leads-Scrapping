# Leadflow — Client Setup Guide
### Required API Keys, Credentials & Services

This document lists every credential the system needs, what it does inside the platform, where to get it, and whether it is required or optional.

---

## How the System Works (Flow Overview)

```
User logs in via Supabase Auth
       ↓
Dashboard loads leads from Supabase Database (PostgreSQL)
       ↓
Generate Leads → RentCast (property owners) or Adzuna (job openings)
       ↓
Enrich Leads → BatchData adds email/phone to leads that have no email
       ↓
Upload Resume → Supabase Storage (private bucket)
       ↓
Create Campaign → Select leads → Enroll → Send via SendGrid
       ↓
Replies arrive → SendGrid Inbound Parse → stored in Inbox
       ↓
Client reviews Inbox → marks leads Interested / Not Interested
```

---

## Section 1 — Database & Authentication

### 1. Supabase Project

**What it does:**
- Stores all leads, campaigns, replies, search jobs, and settings
- Handles user login and authentication (email/password)
- Stores uploaded resumes as private files

**Where to get it:**
1. Go to **supabase.com** → Create a free account
2. Click **New Project** → Enter project name and database password
3. Wait for the project to be ready (~2 minutes)

**Credentials needed:**

| Variable | Where to find it | What it does |
|---|---|---|
| `DATABASE_URL` | Project Settings → Database → **Transaction pooler** connection string (port 6543) | Main database connection for all app queries |
| `MIGRATION_DATABASE_URL` | Project Settings → Database → **Session pooler** connection string (port 5432) | Used only when running database migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → **Project URL** | Public URL for Supabase client (frontend) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → **anon / public key** | Public API key for frontend auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → **service_role key** | Private key for server-side admin operations |
| `CONFIG_DATABASE_URL` | Same as `DATABASE_URL` (transaction pooler) | Stores encrypted app configuration |

> **Important:** The database password you set when creating the project is embedded in the connection strings. Copy the full connection string exactly as shown in Supabase — do not change the password.

**Free tier:** 500 MB database, 1 GB file storage — sufficient for a production launch.

---

### 2. CONFIG_ENCRYPTION_KEY

**What it does:** Encrypts sensitive settings (API keys) stored in the database. Without this, saved keys in the Settings panel cannot be decrypted.

**How to generate:**
Run this command once in any terminal:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output and set it as `CONFIG_ENCRYPTION_KEY`. **Never change this value after the app has been used** — changing it will invalidate all saved settings.

---

## Section 2 — Email Delivery

### 3. SendGrid

**What it does:** Sends all bulk outreach emails to leads. Every campaign email goes through SendGrid. Also handles delivery tracking (sent, bounced, spam complaints) and unsubscribe processing.

**Where to get it:**
1. Go to **sendgrid.com** → Sign up for a free account
2. Dashboard → Settings → **API Keys** → Create API Key → Full Access
3. Copy the key (shown only once)
4. Go to Settings → **Sender Authentication** → verify your sending email address

| Variable | Where to find it | What it does |
|---|---|---|
| `SENDGRID_API_KEY` | SendGrid → Settings → API Keys | Authorizes the system to send emails via SendGrid |
| `SENDGRID_EVENT_PUBLIC_KEY` | SendGrid → Settings → Mail Settings → Event Webhook → Signed Event Webhook public key | Verifies that delivery/bounce/complaint events actually came from SendGrid |
| `SENDGRID_PARSE_PUBLIC_KEY` | SendGrid → Settings → Inbound Parse → Signing key | Verifies that inbound reply emails actually came from SendGrid |
| `INBOUND_REPLY_DOMAIN` | Your DNS panel — a subdomain you configure (e.g. `replies.yourdomain.com`) | The email subdomain where lead replies are received automatically |

**Free tier:** 100 emails/day. Paid plans start at ~$20/month for higher volume.

> **Note:** `SENDGRID_EVENT_PUBLIC_KEY`, `SENDGRID_PARSE_PUBLIC_KEY`, and `INBOUND_REPLY_DOMAIN` are optional for basic sending. They are needed only if you want automatic delivery tracking and auto-capture of replies.

---

## Section 3 — Lead Generation

### 4. RentCast — Property Owner Leads (Life Insurance)

**What it does:** Pulls US property owner records (name, address, property type, city, state) for Life Insurance lead generation. These are real homeowners from public property records.

**Where to get it:**
1. Go to **app.rentcast.io** → Sign up
2. Dashboard → API → Copy your API key
3. Go to the API billing section → Activate a plan (free plan = 50 requests/month)

| Variable | Where to find it | What it does |
|---|---|---|
| `RENTCAST_API_KEY` | RentCast Dashboard → API | Authenticates property data requests |

**Free tier:** 50 API requests/month (~500 leads). Paid plans available for higher volume.

> **Note:** RentCast does not include email addresses. Use BatchData (below) to enrich leads with contact details.

---

### 5. BatchData — Email & Phone Enrichment

**What it does:** Takes property leads from RentCast (which have no email) and finds the owner's email address and phone number through property skip-trace. This is what makes RentCast leads contactable.

**Where to get it:**
1. Go to **app.batchdata.com** → Register
2. Add billing credits to your account (minimum ~$10)
3. Dashboard → API Keys → Copy key

| Variable | Where to find it | What it does |
|---|---|---|
| `BATCHDATA_API_KEY` | BatchData Dashboard → API Keys | Authorizes skip-trace requests to find owner contact info |

**Pricing:** Pay-per-match (~$0.15–$0.40 per matched record). No monthly minimum on the self-serve plan.

---

### 6. Adzuna — Job Opening Leads (Hiring / Recruitment)

**What it does:** Pulls live US job postings from Adzuna's job board. Used for the Hiring & Recruitment industry — generates leads of companies that are actively hiring (useful for recruitment outreach).

**Where to get it:**
1. Go to **developer.adzuna.com** → Register
2. After login → API Access → your App ID and App Key are displayed

| Variable | Where to find it | What it does |
|---|---|---|
| `ADZUNA_APP_ID` | Adzuna Developer Dashboard → API Access | Identifies your application |
| `ADZUNA_APP_KEY` | Adzuna Developer Dashboard → API Access | Authenticates job search requests |

**Free tier:** Completely free. No credit card required.

> **Note:** Adzuna returns job postings only (employer name, job title, location, description). It does not return candidate resumes or personal contact info.

---

### 7. Licensed Lead API (Optional — Custom Provider)

**What it does:** If you have a contract with a paid lead data provider (e.g. a B2C insurance data vendor or an ATS platform), this connects that provider to the system. The system sends a search request and the provider returns matching leads.

| Variable | What it does |
|---|---|
| `LEAD_API_URL` | The HTTPS endpoint of your licensed provider |
| `LEAD_API_KEY` | Bearer token to authenticate with your provider |

**This is optional.** Only needed if you have a separate data contract. Leave blank if not applicable.

---

## Section 4 — File Storage (Resumes)

### 8. Supabase Storage Bucket

**What it does:** Stores candidate resume files (PDF/DOCX) uploaded from lead detail pages. Files are stored privately — only authenticated users of that workspace can download them.

**Setup steps (inside your Supabase project):**
1. Supabase Dashboard → **Storage**
2. Click **New Bucket**
3. Name: `leadflow-resumes`
4. Set to **Private** (not public)
5. No additional configuration needed — the app handles the rest

> **No extra credentials needed.** This uses the same Supabase credentials already configured above (`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`).

---

## Section 5 — App Configuration

### 9. APP_URL

**What it does:** The public URL of your deployed application. Used to build unsubscribe links in outreach emails. Every campaign email includes an unsubscribe link pointing to this URL.

| Variable | Value |
|---|---|
| `APP_URL` | Your Vercel deployment URL, e.g. `https://your-app.vercel.app` |

Set this to your actual deployed domain after Vercel deployment.

---

### 10. Security Secrets (Self-Generated)

These are not obtained from any external service — you generate them yourself. Each must be a random 32-byte hex string.

**How to generate each one:**
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run this command once for each secret. They must remain stable — changing them after deployment will break active sessions and unsubscribe links.

| Variable | What it does |
|---|---|
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe links in emails so they cannot be forged |
| `INBOUND_WEBHOOK_SECRET` | Verifies that inbound event webhooks came from a trusted source |
| `CRON_SECRET` / `SCHEDULER_SECRET` | Authenticates the external scheduler that triggers automated campaign sends |

---

### 11. LIVE_SEND_ENABLED

**What it does:** A safety switch. When set to `false`, the system blocks all email sending — useful during setup and testing. Set to `true` only after you have verified your SendGrid sender domain and confirmed unsubscribe links are working.

| Value | Behavior |
|---|---|
| `false` | All email sending is blocked (safe default) |
| `true` | Live email sending is enabled |

---

## Complete Summary Table

| # | Variable | Service | Required? | Cost | Get it from |
|---|---|---|---|---|---|
| 1 | `DATABASE_URL` | Supabase | ✅ Yes | Free | supabase.com → Project Settings → Database |
| 2 | `MIGRATION_DATABASE_URL` | Supabase | ✅ Yes | Free | supabase.com → Project Settings → Database |
| 3 | `NEXT_PUBLIC_SUPABASE_URL` | Supabase | ✅ Yes | Free | supabase.com → Project Settings → API |
| 4 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase | ✅ Yes | Free | supabase.com → Project Settings → API |
| 5 | `SUPABASE_SERVICE_ROLE_KEY` | Supabase | ✅ Yes | Free | supabase.com → Project Settings → API |
| 6 | `CONFIG_DATABASE_URL` | Supabase | ✅ Yes | Free | Same as DATABASE_URL |
| 7 | `CONFIG_ENCRYPTION_KEY` | Self-generated | ✅ Yes | Free | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| 8 | `SENDGRID_API_KEY` | SendGrid | ✅ Yes (for email) | Free (100/day) | sendgrid.com → Settings → API Keys |
| 9 | `APP_URL` | Self (your domain) | ✅ Yes | Free | Your Vercel deployment URL |
| 10 | `UNSUBSCRIBE_SECRET` | Self-generated | ✅ Yes | Free | Generate with node command |
| 11 | `LIVE_SEND_ENABLED` | Self | ✅ Yes | Free | Set to `true` when ready to send |
| 12 | `RENTCAST_API_KEY` | RentCast | ✅ Yes (for property leads) | Free (50/mo) | app.rentcast.io → API |
| 13 | `ADZUNA_APP_ID` | Adzuna | ✅ Yes (for job leads) | Free | developer.adzuna.com |
| 14 | `ADZUNA_APP_KEY` | Adzuna | ✅ Yes (for job leads) | Free | developer.adzuna.com |
| 15 | `BATCHDATA_API_KEY` | BatchData | ⚠️ Recommended | Pay-per-use (~$0.15–$0.40/match) | app.batchdata.com |
| 16 | `INBOUND_WEBHOOK_SECRET` | Self-generated | ⚠️ Recommended | Free | Generate with node command |
| 17 | `CRON_SECRET` | Self-generated | ⚠️ Recommended | Free | Generate with node command |
| 18 | `SENDGRID_EVENT_PUBLIC_KEY` | SendGrid | Optional | Free (included) | SendGrid → Event Webhook settings |
| 19 | `SENDGRID_PARSE_PUBLIC_KEY` | SendGrid | Optional | Free (included) | SendGrid → Inbound Parse settings |
| 20 | `INBOUND_REPLY_DOMAIN` | Your DNS | Optional | Free | Configure a subdomain in your DNS |
| 21 | `LEAD_API_URL` + `LEAD_API_KEY` | Custom provider | Optional | Varies | Your licensed data provider |

---

## Minimum to Go Live (MVP)

To get the system fully working, these are the absolute minimum credentials needed:

1. **Supabase** — DATABASE_URL, MIGRATION_DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, CONFIG_DATABASE_URL, CONFIG_ENCRYPTION_KEY
2. **SendGrid** — SENDGRID_API_KEY + verify your sender email
3. **APP_URL** — your Vercel deployment URL
4. **UNSUBSCRIBE_SECRET** — self-generated
5. **LIVE_SEND_ENABLED=true**
6. **RentCast** — RENTCAST_API_KEY (for Life Insurance leads)
7. **Adzuna** — ADZUNA_APP_ID + ADZUNA_APP_KEY (for Hiring leads)

BatchData is strongly recommended if you want to send emails to RentCast leads (since RentCast does not include emails on its own).

---

*Document generated for Leadflow Lead Generation & Outreach Platform.*
