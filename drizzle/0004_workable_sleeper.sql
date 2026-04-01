DROP TABLE `tickets`;--> statement-breakpoint
ALTER TABLE `bookings` ADD `is_used` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `payments` ADD `external_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `checkout_url` text;