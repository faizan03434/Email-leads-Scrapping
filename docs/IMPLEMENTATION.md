# Leadflow implementation and delivery strategy

## Scope and evidence
The supplied project brief is the source of truth. The ChatGPT share URL could not be fetched in this environment. Its phase-by-phase plan has NOT been reviewed; paste or export it to reconcile scope before calling all phases complete.

Built as a browser application using React, TypeScript and a Cloudflare Worker, with D1 for structured records and R2 for private resumes. The hosted workspace is owner-private. Records are scoped to the authenticated user on every API query. This is an initial working implementation, not a claim of production readiness for high-volume sending or recruiting data access.

## Implemented
- Responsive lead dashboard, industry switching, all US states plus DC, city/search/status/type/skills filters, server pagination.
- Durable lead creation/editing, source provenance, permission tracking and notes.
- CSV import (1,000 rows per batch), normalized-email deduplication, filtered/selected CSV export (10,000-row ceiling).
- Custom industries stored without code changes; candidate skills/experience and private PDF/DOCX resume attachments.
- Persistent personalized campaign drafts, eligible-recipient enrollment, durable delivery queue, manual batches and scheduler endpoint.
- SendGrid HTTP delivery adapter, idempotency keys, per-workspace send lock, daily cap, suppression rechecks, unsubscribe links, uncertainty tracking.
- Native signed SendGrid delivery and Inbound Parse endpoints; private hosting callback access is a go-live gate.
- Inbox with manual replies and human-reviewed interest classification. Signed normalized webhook for reply/delivery/bounce/complaint events.
- API key configuration stays server-side; no credentials embedded in the browser.

## Strategy corrections
1. A Google API key is not a universal lead source. Places is business discovery with storage/attribution restrictions, not a source of private consumer emails or candidate resumes.
2. Job advertisements are not candidate records. Do not infer an applicant’s phone, email, skills or resume from a job listing.
3. Indeed must remain gated until approved access, permitted fields, retention and integration terms are confirmed. No scraping adapter is included.
4. Email delivery and inbox access are separate integrations. Sending alone does not collect replies. The normalized inbound endpoint requires a gateway that verifies the provider’s original signature and maps delivery identifiers.
5. High volume requires provider licensing, quotas, deliverability planning, monitored queues, load tests and operational support. A loop that sends many messages is not sufficient.
6. Interest classification is a reviewable human decision here. No unsupported AI confidence scores or fabricated interested responses.

## Phases and remaining production gates
1. Foundation and workflow: implemented; validate with client-owned test data.
2. Data integrations: normalized licensed-source adapter implemented. Select a provider, obtain its agreement and credentials, build/test its mapping, pagination and quota behavior. Client confirmed both insurance consumers and agents/agencies; separate lead types are implemented.
3. Outreach: queue and delivery adapter implemented. Verify domain, configure SPF/DKIM/DMARC through the provider, configure reply routing and business identity; perform a small authorized test.
4. Automation and reply sync: configure an authenticated scheduler and provider webhook gateway; test duplicate, out-of-order and retry events. All new campaigns are drafts by default.
5. Client rollout: agree authentication for non-OpenAI client users, team roles, retention/deletion policy, backup/recovery, monitoring, attachment malware scanning, privacy notices and source-specific obligations. Run realistic volume and security tests before production launch.

## Deliberate limitations
- No configured provider or email credentials at delivery; no real leads generated and no messages sent during development.
- No native Indeed/LinkedIn resume search. Greenhouse/Lever public jobs endpoints are for job listings, not permission to retrieve candidates. ATS applicant access needs customer authorization.
- Export returns at most 10,000 records. Large exports require background generation before scaling.
- Inbox displays the latest 200 replies; campaign list displays the latest 200 campaigns.
- Auth uses private Sites/ChatGPT identity. This is not yet a client-branded, multi-user SaaS authentication system.
- Resume uploads check file type/signature and size; they are downloaded as attachments. Malware scanning and content extraction are not implemented.
- Ambiguous email results remain `Sending` with an error and require provider reconciliation. Automatic retries must not duplicate uncertain deliveries.
- Live provider, inbound gateway, scheduled sending and end-to-end email deliverability need real credentials and authorized test recipients.

## Research references
- Indeed access: https://docs.indeed.com/getstarted/integrate-and-call-apis
- Indeed API catalog: https://docs.indeed.com/
- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Resend inbound: https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook

## Local development
Use Node >=22.13 and the locked dependencies. `npm ci`, `npm run db:generate`, `npm run build`, then apply generated SQL locally as described in the starter README. `npm run dev` starts the development server. Local sign-in is `/signin-with-chatgpt?return_to=/`; the portable starter supplies a loopback-only identity. Production auth remains controlled by the hosting platform.
