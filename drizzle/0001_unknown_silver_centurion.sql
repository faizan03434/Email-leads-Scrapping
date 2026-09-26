CREATE TABLE `auditLogs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`actorId` text NOT NULL,
	`actorEmail` text NOT NULL,
	`action` text NOT NULL,
	`entityId` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_workspace_time` ON `auditLogs` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`userId` text,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_workspace_email` ON `memberships` (`workspaceId`,`email`);--> statement-breakpoint
CREATE INDEX `membership_user` ON `memberships` (`userId`);--> statement-breakpoint
CREATE TABLE `searchJobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`criteria` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`requested` integer NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`imported` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`nextRunAt` text NOT NULL,
	`leaseUntil` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `search_jobs_owner_status` ON `searchJobs` (`owner`,`status`);--> statement-breakpoint
CREATE INDEX `search_jobs_schedule` ON `searchJobs` (`status`,`nextRunAt`);--> statement-breakpoint
ALTER TABLE `leads` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `zip` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `jobTitle` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `sourceRef` text;--> statement-breakpoint
CREATE UNIQUE INDEX `leads_source_identity` ON `leads` (`owner`,`source`,`sourceRef`);