CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`channel` text NOT NULL,
	`to` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`generated_by` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drafts_listing_idx` ON `drafts` (`listing_id`);--> statement-breakpoint
CREATE INDEX `drafts_status_idx` ON `drafts` (`status`);--> statement-breakpoint
CREATE TABLE `geocode_cache` (
	`address_key` text PRIMARY KEY NOT NULL,
	`lat` real,
	`lon` real,
	`matched_address` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listing_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`url` text NOT NULL,
	`is_primary` integer NOT NULL,
	`missed_runs` integer NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listing_sources_listing_idx` ON `listing_sources` (`listing_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `listing_sources_key` ON `listing_sources` (`source_id`,`source_listing_id`);--> statement-breakpoint
CREATE TABLE `listing_state` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`starred` integer NOT NULL,
	`hidden` integer NOT NULL,
	`notes` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`price` real,
	`price_max` real,
	`beds` real,
	`beds_max` real,
	`baths` real,
	`sqft` real,
	`property_type` text NOT NULL,
	`is_sublet` integer NOT NULL,
	`income_restricted` integer NOT NULL,
	`senior_housing` integer NOT NULL,
	`address` text,
	`neighborhood` text,
	`zip` text,
	`lat` real,
	`lon` real,
	`available_date` text,
	`lease_months` real,
	`photos_json` text NOT NULL,
	`amenities_json` text NOT NULL,
	`contact_json` text NOT NULL,
	`scam_signals_json` text NOT NULL,
	`price_history_json` text NOT NULL,
	`status` text NOT NULL,
	`posted_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE INDEX `listings_first_seen_idx` ON `listings` (`first_seen_at`);--> statement-breakpoint
CREATE TABLE `matches` (
	`listing_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`matched` integer NOT NULL,
	`rejected_by_json` text NOT NULL,
	`score` real NOT NULL,
	`breakdown_json` text NOT NULL,
	`price_per_person` real,
	`walk_minutes` real,
	`distance_miles` real,
	`notified_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`listing_id`, `profile_id`),
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matches_profile_idx` ON `matches` (`profile_id`,`matched`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`listing_id` text,
	`profile_id` text,
	`pushed` integer NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `outbox_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`notification_id` text NOT NULL,
	`reason` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`click` text,
	`created_at` text NOT NULL,
	`released_at` text
);
--> statement-breakpoint
CREATE INDEX `outbox_holds_profile_idx` ON `outbox_holds` (`profile_id`,`released_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	`color` text NOT NULL,
	`preferences_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`walk_minutes` real,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`setup_complete` integer NOT NULL,
	`campus_id` text NOT NULL,
	`identity_json` text NOT NULL,
	`compose_via` text NOT NULL,
	`ntfy_server` text NOT NULL,
	`dashboard_url` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`homepage` text NOT NULL,
	`enabled` integer NOT NULL,
	`interval_sec` integer NOT NULL,
	`config_json` text NOT NULL,
	`needs_setup` integer NOT NULL,
	`setup_hint` text,
	`last_run_at` text,
	`last_success_at` text,
	`last_error` text,
	`consecutive_failures` integer NOT NULL,
	`last_run_count` integer NOT NULL,
	`total_listings` integer NOT NULL,
	`baseline_at` text,
	`disabled_at` text,
	`backoff_until` text,
	`down_notified_at` text
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL
);
