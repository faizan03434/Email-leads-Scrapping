CREATE TABLE "admin_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"reset_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_configuration" (
	"name" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.app_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_configuration,public.admin_login_attempts FROM anon,authenticated;
