CREATE TABLE `cast` (
	`cast_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`character_name` text NOT NULL,
	`photo_url` text,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`movie_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`actor_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `movie_cast`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_movies` (
	`movie_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`synopsis` text NOT NULL,
	`duration` integer NOT NULL,
	`genre` text NOT NULL,
	`rating_age` text NOT NULL,
	`photo_url` text,
	`trailer_url` text,
	`release_date` text,
	`end_date` text,
	`is_playing` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
INSERT INTO `__new_movies`("movie_id", "title", "slug", "synopsis", "duration", "genre", "rating_age", "photo_url", "trailer_url", "release_date", "end_date", "is_playing", "created_at", "updated_at") SELECT "movie_id", "title", "slug", "synopsis", "duration", "genre", "rating_age", "photo_url", "trailer_url", "release_date", "end_date", "is_playing", "created_at", "updated_at" FROM `movies`;--> statement-breakpoint
DROP TABLE `movies`;--> statement-breakpoint
ALTER TABLE `__new_movies` RENAME TO `movies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_admins` (
	`admin_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`photo_url` text,
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
INSERT INTO `__new_admins`("admin_id", "full_name", "email", "password", "photo_url", "created_at", "updated_at") SELECT "admin_id", "full_name", "email", "password", "photo_url", "created_at", "updated_at" FROM `admins`;--> statement-breakpoint
DROP TABLE `admins`;--> statement-breakpoint
ALTER TABLE `__new_admins` RENAME TO `admins`;--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`booking_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`schedule_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`total_price` real NOT NULL,
	`status_booking` text DEFAULT 'PENDING',
	`is_used` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`schedule_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_bookings`("booking_id", "user_id", "schedule_id", "quantity", "total_price", "status_booking", "is_used", "created_at", "updated_at") SELECT "booking_id", "user_id", "schedule_id", "quantity", "total_price", "status_booking", "is_used", "created_at", "updated_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`payment_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`checkout_url` text,
	`payment_method` text NOT NULL,
	`amount` real NOT NULL,
	`payment_status` text DEFAULT 'PENDING',
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime')),
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_payments`("payment_id", "booking_id", "external_id", "checkout_url", "payment_method", "amount", "payment_status", "created_at", "updated_at") SELECT "payment_id", "booking_id", "external_id", "checkout_url", "payment_method", "amount", "payment_status", "created_at", "updated_at" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_external_id_unique` ON `payments` (`external_id`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`phone_number` text NOT NULL,
	`jk` text NOT NULL,
	`tanggal_lahir` text NOT NULL,
	`address` text,
	`photo_url` text,
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("user_id", "full_name", "email", "password", "phone_number", "jk", "tanggal_lahir", "address", "photo_url", "created_at", "updated_at") SELECT "user_id", "full_name", "email", "password", "phone_number", "jk", "tanggal_lahir", "address", "photo_url", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_number_unique` ON `users` (`phone_number`);--> statement-breakpoint
ALTER TABLE `seats` ADD `status` text DEFAULT 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX `studio_seat_unique` ON `seats` (`studio_id`,`row_name`,`seat_number`);--> statement-breakpoint
ALTER TABLE `booking_details` DROP COLUMN `status_seat`;