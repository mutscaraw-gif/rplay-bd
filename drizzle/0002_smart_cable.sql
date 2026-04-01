CREATE TABLE `movies` (
	`movie_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`synopsis` text NOT NULL,
	`duration` integer NOT NULL,
	`genre` text NOT NULL,
	`rating_age` text NOT NULL,
	`photo_url` text,
	`trailer_url` text,
	`is_playing` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_slug_unique` ON `movies` (`slug`);