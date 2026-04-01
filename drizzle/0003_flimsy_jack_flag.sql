CREATE TABLE `actors` (
	`actor_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_name` text NOT NULL,
	`photo_url` text
);
--> statement-breakpoint
CREATE TABLE `booking_details` (
	`detail_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`seat_id` integer NOT NULL,
	`status_seat` text DEFAULT 'BOOKED',
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`seat_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`booking_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`schedule_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`total_price` real NOT NULL,
	`status_booking` text DEFAULT 'PENDING',
	`payment_limit` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`schedule_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cinemas` (
	`cinema_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city_id` integer NOT NULL,
	`nama_bioskop` text NOT NULL,
	`alamat` text NOT NULL,
	`map_url` text,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`city_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cities` (
	`city_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movie_cast` (
	`cast_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`character_name` text NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`movie_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`actor_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`payment_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`payment_method` text NOT NULL,
	`amount` real NOT NULL,
	`payment_status` text DEFAULT 'PENDING',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`schedule_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`studio_id` integer NOT NULL,
	`show_date` text NOT NULL,
	`show_time` text NOT NULL,
	`price` real NOT NULL,
	`available_seats` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`movie_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`studio_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seats` (
	`seat_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`studio_id` integer NOT NULL,
	`seat_number` text NOT NULL,
	`row_name` text NOT NULL,
	`pos_x` integer NOT NULL,
	`pos_y` integer NOT NULL,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`studio_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `studios` (
	`studio_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cinema_id` integer NOT NULL,
	`nama_studio` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`cinema_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`ticket_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`seat_id` integer NOT NULL,
	`qr_code` text NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`seat_id`) ON UPDATE no action ON DELETE cascade
);
