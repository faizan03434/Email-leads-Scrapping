CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`industry` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaigns_owner` ON `campaigns` (`owner`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`campaignId` text NOT NULL,
	`leadId` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`providerId` text,
	`error` text,
	`createdAt` text NOT NULL,
	`sentAt` text,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_campaign_lead` ON `deliveries` (`campaignId`,`leadId`);--> statement-breakpoint
CREATE INDEX `deliveries_owner_status` ON `deliveries` (`owner`,`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `industries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `industries_owner_name` ON `industries` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`industry` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'Prospect' NOT NULL,
	`skills` text DEFAULT '' NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`sourceUrl` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'New' NOT NULL,
	`permission` text DEFAULT 'Unknown' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`resumeKey` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_owner_email` ON `leads` (`owner`,`email`);--> statement-breakpoint
CREATE INDEX `leads_owner_industry_state` ON `leads` (`owner`,`industry`,`state`);--> statement-breakpoint
CREATE INDEX `leads_owner_created` ON `leads` (`owner`,`createdAt`);--> statement-breakpoint
CREATE TABLE `replies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`leadId` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`classification` text DEFAULT 'Needs review' NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `replies_owner` ON `replies` (`owner`);--> statement-breakpoint
CREATE TABLE `sendLocks` (
	`owner` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`reason` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppression_owner_email` ON `suppressions` (`owner`,`email`);