# Solara review and baseline decision — 2026-09-26

Reviewed the supplied `solara-app (2).zip` without executing it. Original archive preserved. Reference extraction is under ignored `work/solara-review`.

## What actually exists
| Source | Implementation | Assessment |
|---|---|---|
| `netlify/functions/generate-leads.mts` | GET RentCast `/v1/properties`, X-Api-Key, city and count | Real HTTP integration; state is hard-coded to NJ; returns property owner records without email. No evidence of insurance purchase intent. |
| `netlify/functions/enrich-leads.mts` | Google geocoding, BatchData skip-trace, DataZapp append | Real HTTP calls, but response shapes are explicitly guessed and matched by array position. Do not reuse positional matching without provider identifiers. |
| `netlify/functions/campaigns.mts` | Gmail SMTP/app password via Nodemailer | Real sending code; sequential synchronous sending; no durable queue, reply sync, suppression checks or authenticated endpoints. SMTP is incompatible with this Sites runtime's no-raw-TCP limitation. |
| `netlify/functions/settings.mts` | Secrets saved to Netlify Blobs and masked on read | Masking is useful, but endpoints lack login/authorization. Anyone reaching them can modify settings. Do not copy this security model. |
| `src/App.jsx` | Generate fallback calls makeLead and saves random names/emails when no key | MOCK path uses real email domains and can enter campaign targeting. Excluded from this implementation. |
| `netlify/functions/leads.mts` | Shared JSON blob list | Persistent, but whole-list read/modify/write can lose concurrent updates; no relational tenancy. |

## Reuse decisions
Reuse the clear generation → enrichment → campaign workflow, provider availability indicators, missing-contact counts, settings organization and explicit provider names. Adapt RentCast's documented HTTP request with dynamic state selection and durable paginated jobs. Add job listing support separately; do not rename property owners or jobs into candidates. Keep authenticated APIs, structured storage, suppression and signed callbacks.

## Baseline before changes
Source revision: `90ff2cb4e840d63d3597b5eae45135fa9bfd3182`. The supplied Kiro reports are preserved in `KIRO_BASELINE_AUDIT.md` and `KIRO_BASELINE_TESTING.md`.

An independent application-scope ESLint run found **49 errors and 1 warning**. This confirms the supplied report's combined total (48 explicit-any plus the anchor rule, or equivalent per-file accounting must be read from work/baseline-lint.json); these have not been treated as passing. No authenticated team model, audit history or durable generation jobs existed at this revision. Lead generation was a synchronous generic provider contract. SendGrid and webhook code existed but no real credentials were configured. Current core storage/CRUD had earlier local workflow tests, not a production email or provider certification.

The supplied audit prompt says to audit before changing architecture. That baseline review is complete. The latest user message explicitly requests implementation, settings/audit/user management and UI improvements, so subsequent work is authorized; the final audit will describe the resulting code honestly.

## Correction to the third-party report
“Indeed API shut down in 2022” is not a valid statement about all current Indeed integrations. Current partner documentation includes job, application and candidate integrations. Access is provisioned, not open candidate scraping: https://docs.indeed.com/ . This project will not promise a native Indeed candidate search without approval.

## Verification boundaries
Solara being operational in another environment does not prove its integrations meet this application's industries, permission, security or scale requirements. Live matches and provider access cannot be verified without the client's credentials and entitlement.
