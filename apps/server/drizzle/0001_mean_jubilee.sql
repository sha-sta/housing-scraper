ALTER TABLE `listings` ADD `price_basis` text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `monthly_total` real;