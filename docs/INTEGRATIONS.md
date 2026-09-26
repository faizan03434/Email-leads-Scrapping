# Integration contracts

The client selected SendGrid for initial delivery. Gmail/Google Workspace and Outlook/Microsoft Graph are planned as later OAuth-backed provider adapters; they are not connected or implemented yet. Insurance consumers and insurance agents/agencies are separate lead types.

## Native SendGrid delivery events

**Hosting gate:** The initial Sites deployment is owner-private. Its edge sign-in can block third-party callbacks and recipient unsubscribe links. Do not start external campaigns from this preview. Before live sending, deploy the app with public access to ONLY the signed callback, scheduler and unsubscribe routes, while keeping dashboard/API routes authenticated. Confirm callbacks and unsubscribe URLs work without a workspace login. Do not make the entire dashboard public to solve this.
Enable Signed Event Webhook in SendGrid, save its verification key as `SENDGRID_EVENT_PUBLIC_KEY`, and use `/api/sendgrid/events` as the webhook URL. Subscribe to delivered, bounce, spamreport, dropped and unsubscribe events. The application verifies SendGrid's ECDSA signature against the exact raw body and timestamp. The outbound `leadflow_delivery_id` custom argument correlates deliveries without trusting an owner identifier from a request. Events are deduplicated by `sg_event_id`; bounces, complaints and unsubscribes suppress contacts. Delivery events do not contain inbound reply content.

Official references: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send and https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features

## Native SendGrid inbound replies
Configure a dedicated receiving subdomain and MX records in SendGrid Inbound Parse, use `/api/sendgrid/parse`, enable signed Parse webhooks, and save the separate verification key as `SENDGRID_PARSE_PUBLIC_KEY`. Set `INBOUND_REPLY_DOMAIN` to that subdomain. Outbound replies then use `reply+<delivery UUID>@<subdomain>` for deterministic correlation. Keep raw MIME mode disabled: this route expects parsed multipart fields. Replies are deduplicated by Message-ID with a content fallback, stored as plain text, and always marked Needs review. Signature verification proves provider origin, not the identity or intent of the email author. Attachments are noted but not ingested automatically. Messages over 6 MB are rejected; configure operational monitoring for rejected webhooks.

References: https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook and https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/securing-your-parse-webhooks

Set production values using Sites environment secrets. `.env.example` lists local names. Never commit credentials. Merely setting a key does not establish permission to access a dataset.

## Licensed lead provider
`LEAD_API_URL` must be a trusted HTTPS endpoint you control or a licensed provider adapter. `LEAD_API_KEY` is sent as a Bearer credential.

Request: `POST` JSON `{ "industry":"Hiring / Recruitment", "state":"Texas", "city":"Austin", "query":"sales", "type":"Candidate", "limit":50 }`.

Response: `{ "leads": [{ "name":"Example Contact", "email":"contact@example.com", "phone":"", "company":"", "state":"Texas", "city":"Austin", "type":"Candidate", "skills":"sales", "experience":"5 years", "source":"Your licensed provider", "sourceUrl":"https://example.com/source-record", "permission":"Unknown", "notes":"Source permission evidence" }] }`.

Allowed types: Prospect, Insurance consumer, Insurance agent / agency, Candidate, Business, Job opening. Permissions: Unknown, Opted in, Permitted business contact. Never label scraped data as opted in. Email can be absent; the system does not invent missing fields. Requests cap at 500 records and 25 seconds. The adapter must enforce search criteria and provider rate limits. It must implement provider-specific pagination for larger datasets; this first version does not crawl an entire provider database.

## Outbound
After verifying callback and unsubscribe access, set `LIVE_SEND_ENABLED=true`. Configure `SENDGRID_API_KEY`, `APP_URL` (canonical HTTPS site origin), `UNSUBSCRIBE_SECRET` (random 32+ byte secret), sender identity and daily limit. A verified sending domain is required. Configure a real monitored reply-to mailbox. Enroll leads from the Leads table, then review and send a batch from Campaigns. Only permissioned recipients matching the campaign industry are enrolled.

The delivery row UUID is sent as the leadflow_delivery_id custom argument. SendGrid has no assumed idempotency API here; durable queue reservation prevents concurrent sends, and uncertain requests are never automatically retried. Check uncertain `Sending` or `Failed` rows against provider logs before any requeue. Never silently reset them. SendGrid acceptance records `Sent`; a normalized delivery webhook records `Delivered`.

## Inbound gateway
The endpoint is `/api/inbound`. This contract is NOT a native SendGrid webhook payload. Run a provider gateway that verifies the original provider signature, fetches inbound content when necessary, correlates a reply using Message-ID/In-Reply-To or tracked reply routing, and maps the original provider message to a Leadflow delivery UUID. Do not match arbitrary untrusted payloads by owner ID.

Body: `{ "id":"unique-provider-event-id", "type":"reply", "deliveryId":"UUID", "subject":"Re: opportunity", "body":"Please send more details." }`.

Types: reply, delivered, bounced, complained. Bounce means a permanent failure; do not map a temporary delay to bounced.

Headers: `x-leadflow-timestamp` is current Unix seconds. `x-leadflow-signature` is lowercase hex HMAC-SHA256 of `${timestamp}.${exactRawBody}`, signed with `INBOUND_WEBHOOK_SECRET`. Events outside five minutes are rejected. Duplicate event IDs are idempotent and event insertion plus side effects are atomic.

Replies are labeled Needs review. Bounce and complaint events suppress future outreach. Human classification of Unsubscribe also suppresses. Attachments arriving through inbound email are not automatically downloaded; upload permissioned resumes through the lead detail panel.

## Scheduler
Set `SCHEDULER_SECRET` to a random 32+ byte secret. An external scheduler may call `POST /api/automation` once per minute with `Authorization: Bearer <secret>`. Only campaigns explicitly activated in the dashboard are processed. Each request advances one active campaign by up to 20 recipients, keeping daily limits and send locks. Keep the scheduler disabled until real delivery tests pass. The application does not provision the external scheduler automatically.
