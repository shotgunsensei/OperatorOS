CREATE TABLE "torqueshed_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "torqueshed_users" (
	"id" text PRIMARY KEY NOT NULL,
	"operatoros_user_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"platform_role" text DEFAULT 'user' NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_slug" text,
	"tenant_name" text NOT NULL,
	"tenant_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"stage_id" uuid,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_follows" (
	"tenant_id" text NOT NULL,
	"follower_user_id" text NOT NULL,
	"followed_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_follows_follower_user_id_followed_user_id_pk" PRIMARY KEY("follower_user_id","followed_user_id")
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"vehicle_id" uuid,
	"build_id" uuid,
	"kind" text DEFAULT 'build_update' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reactions_post_id_user_id_reaction_pk" PRIMARY KEY("post_id","user_id","reaction")
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"reporter_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnostic_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"value" text NOT NULL,
	"unit" text,
	"outcome" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"customer_concern" text NOT NULL,
	"symptoms" text DEFAULT '' NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"freeze_frame" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"probable_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_root_cause" text,
	"repair_performed" text,
	"verification" text,
	"final_resolution" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnostic_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"concern_pattern" text DEFAULT '' NOT NULL,
	"test_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_trouble_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"freeze_frame" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_tags" (
	"tag_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "entity_tags_tag_id_entity_type_entity_id_pk" PRIMARY KEY("tag_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_favorites" (
	"listing_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_favorites_listing_id_user_id_pk" PRIMARY KEY("listing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"seller_user_id" text NOT NULL,
	"category" text NOT NULL,
	"listing_type" text DEFAULT 'sell' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"condition" text NOT NULL,
	"price" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"location_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"reporter_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"vehicle_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"budget_cents" integer,
	"started_at" timestamp with time zone,
	"target_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"due_mileage" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"entry_type" text NOT NULL,
	"description" text NOT NULL,
	"purchase_id" uuid,
	"torque_assist_request_id" uuid,
	"external_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_amount" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"package_id" text,
	"token_amount" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "torque_assist_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"diagnostic_session_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"context_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reserved_tokens" integer DEFAULT 2 NOT NULL,
	"charged_tokens" integer DEFAULT 0 NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text,
	"provider_response_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"result" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vehicle_profiles" (
	"vehicle_id" uuid PRIMARY KEY NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_modifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_attachment_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"vendor_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mileage" integer,
	"cost_cents" integer,
	"labor_minutes" integer,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"vin" text,
	"year" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"engine" text,
	"transmission" text,
	"drivetrain" text,
	"mileage" integer,
	"nickname" text,
	"ownership_status" text DEFAULT 'owned' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "torqueshed_sessions" ADD CONSTRAINT "torqueshed_sessions_user_id_torqueshed_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_torqueshed_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_stages" ADD CONSTRAINT "build_stages_build_id_project_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."project_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_tasks" ADD CONSTRAINT "build_tasks_build_id_project_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."project_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_tasks" ADD CONSTRAINT "build_tasks_stage_id_build_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."build_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_user_id_torqueshed_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_follower_user_id_torqueshed_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_followed_user_id_torqueshed_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_torqueshed_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_build_id_project_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."project_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_user_id_torqueshed_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_comment_id_community_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."community_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporter_user_id_torqueshed_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_entries" ADD CONSTRAINT "diagnostic_entries_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_templates" ADD CONSTRAINT "diagnostic_templates_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_trouble_codes" ADD CONSTRAINT "diagnostic_trouble_codes_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_user_id_torqueshed_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_user_id_torqueshed_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_sender_user_id_torqueshed_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_recipient_user_id_torqueshed_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_reporter_user_id_torqueshed_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_builds" ADD CONSTRAINT "project_builds_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_builds" ADD CONSTRAINT "project_builds_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_purchase_id_token_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."token_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_torque_assist_request_id_torque_assist_requests_id_fk" FOREIGN KEY ("torque_assist_request_id") REFERENCES "public"."torque_assist_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_purchases" ADD CONSTRAINT "token_purchases_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_purchases" ADD CONSTRAINT "token_purchases_package_id_token_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."token_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torque_assist_requests" ADD CONSTRAINT "torque_assist_requests_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torque_assist_requests" ADD CONSTRAINT "torque_assist_requests_diagnostic_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("diagnostic_session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_profiles" ADD CONSTRAINT "vehicle_profiles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_records" ADD CONSTRAINT "vehicle_records_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_records" ADD CONSTRAINT "vehicle_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_records" ADD CONSTRAINT "vehicle_records_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_user_id_torqueshed_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."torqueshed_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "torqueshed_sessions_user_idx" ON "torqueshed_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "torqueshed_sessions_expires_idx" ON "torqueshed_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "torqueshed_users_operatoros_user_unique" ON "torqueshed_users" USING btree ("operatoros_user_id");--> statement-breakpoint
CREATE INDEX "torqueshed_users_tenant_idx" ON "torqueshed_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_idx" ON "audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "build_stages_build_idx" ON "build_stages" USING btree ("build_id","position");--> statement-breakpoint
CREATE INDEX "build_tasks_build_idx" ON "build_tasks" USING btree ("build_id","stage_id");--> statement-breakpoint
CREATE INDEX "community_comments_post_idx" ON "community_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_tenant_idx" ON "community_posts" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "community_reports_status_idx" ON "community_reports" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "diagnostic_entries_session_idx" ON "diagnostic_entries" USING btree ("session_id","observed_at");--> statement-breakpoint
CREATE INDEX "diagnostics_vehicle_idx" ON "diagnostic_sessions" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE INDEX "diagnostics_tenant_idx" ON "diagnostic_sessions" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "diagnostic_templates_tenant_idx" ON "diagnostic_templates" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "diagnostic_codes_session_idx" ON "diagnostic_trouble_codes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "marketplace_tenant_status_idx" ON "marketplace_listings" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_seller_idx" ON "marketplace_listings" USING btree ("seller_user_id","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_messages_listing_idx" ON "marketplace_messages" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_reports_status_idx" ON "marketplace_reports" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "notes_entity_idx" ON "notes" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "project_builds_tenant_idx" ON "project_builds" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "service_reminders_vehicle_idx" ON "service_reminders" USING btree ("vehicle_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_tenant_slug_uidx" ON "tags" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "token_ledger_owner_idx" ON "token_ledger_entries" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "token_ledger_assist_uidx" ON "token_ledger_entries" USING btree ("torque_assist_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_ledger_external_uidx" ON "token_ledger_entries" USING btree ("external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_purchase_checkout_uidx" ON "token_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "token_purchases_owner_idx" ON "token_purchases" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "torque_assist_idempotency_uidx" ON "torque_assist_requests" USING btree ("owner_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "torque_assist_session_idx" ON "torque_assist_requests" USING btree ("diagnostic_session_id","created_at");--> statement-breakpoint
CREATE INDEX "vehicle_records_vehicle_idx" ON "vehicle_records" USING btree ("vehicle_id","performed_at");--> statement-breakpoint
CREATE INDEX "vehicle_records_tenant_idx" ON "vehicle_records" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "vehicles_tenant_owner_idx" ON "vehicles" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_tenant_vin_uidx" ON "vehicles" USING btree ("tenant_id","vin");--> statement-breakpoint
CREATE INDEX "vendors_tenant_owner_idx" ON "vendors" USING btree ("tenant_id","owner_user_id");