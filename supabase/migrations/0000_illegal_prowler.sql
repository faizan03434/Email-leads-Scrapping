CREATE TABLE "auditLogs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text NOT NULL,
	"actorId" text NOT NULL,
	"actorEmail" text NOT NULL,
	"action" text NOT NULL,
	"entityId" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"industry" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"campaignId" text NOT NULL,
	"leadId" text NOT NULL,
	"status" text DEFAULT 'Queued' NOT NULL,
	"providerId" text,
	"error" text,
	"createdAt" text NOT NULL,
	"sentAt" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"industry" text NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'Prospect' NOT NULL,
	"skills" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"sourceUrl" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"permission" text DEFAULT 'Unknown' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"resumeKey" text,
	"address" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"jobTitle" text DEFAULT '' NOT NULL,
	"sourceRef" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text NOT NULL,
	"userId" text,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"leadId" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"classification" text DEFAULT 'Needs review' NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searchJobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"provider" text NOT NULL,
	"criteria" text NOT NULL,
	"status" text DEFAULT 'Queued' NOT NULL,
	"requested" integer NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"cursor" text DEFAULT '' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"nextRunAt" text NOT NULL,
	"leaseUntil" bigint DEFAULT 0 NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sendLocks" (
	"owner" text PRIMARY KEY NOT NULL,
	"expiresAt" bigint NOT NULL,
	"token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"owner" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_campaignId_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_leadId_leads_id_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_leadId_leads_id_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_workspace_time" ON "auditLogs" USING btree ("workspaceId","createdAt");--> statement-breakpoint
CREATE INDEX "campaigns_owner" ON "campaigns" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_campaign_lead" ON "deliveries" USING btree ("campaignId","leadId");--> statement-breakpoint
CREATE INDEX "deliveries_owner_status" ON "deliveries" USING btree ("owner","status");--> statement-breakpoint
CREATE UNIQUE INDEX "industries_owner_name" ON "industries" USING btree ("owner","name");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_owner_email" ON "leads" USING btree ("owner","email");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_source_identity" ON "leads" USING btree ("owner","source","sourceRef");--> statement-breakpoint
CREATE INDEX "leads_owner_industry_state" ON "leads" USING btree ("owner","industry","state");--> statement-breakpoint
CREATE INDEX "leads_owner_created" ON "leads" USING btree ("owner","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_workspace_email" ON "memberships" USING btree ("workspaceId","email");--> statement-breakpoint
CREATE INDEX "membership_user" ON "memberships" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "replies_owner" ON "replies" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "search_jobs_owner_status" ON "searchJobs" USING btree ("owner","status");--> statement-breakpoint
CREATE INDEX "search_jobs_schedule" ON "searchJobs" USING btree ("status","nextRunAt");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_owner_email" ON "suppressions" USING btree ("owner","email");