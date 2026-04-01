import { sqliteTable, AnySQLiteColumn, integer, text, foreignKey, real, uniqueIndex } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const actors = sqliteTable("actors", {
	actorId: integer("actor_id").primaryKey({ autoIncrement: true }).notNull(),
	actorName: text("actor_name").notNull(),
	photoUrl: text("photo_url"),
});

export const bookingDetails = sqliteTable("booking_details", {
	detailId: integer("detail_id").primaryKey({ autoIncrement: true }).notNull(),
	bookingId: integer("booking_id").notNull().references(() => bookings.bookingId, { onDelete: "cascade" } ),
	seatId: integer("seat_id").notNull().references(() => seats.seatId, { onDelete: "cascade" } ),
	statusSeat: text("status_seat").default("BOOKED"),
});

export const bookings = sqliteTable("bookings", {
	bookingId: integer("booking_id").primaryKey({ autoIncrement: true }).notNull(),
	userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" } ),
	scheduleId: integer("schedule_id").notNull().references(() => schedules.scheduleId, { onDelete: "cascade" } ),
	quantity: integer().notNull(),
	totalPrice: real("total_price").notNull(),
	statusBooking: text("status_booking").default("PENDING"),
	isUsed: integer("is_used").default(false),
	paymentLimit: text("payment_limit"),
	createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
});

export const cinemas = sqliteTable("cinemas", {
	cinemaId: integer("cinema_id").primaryKey({ autoIncrement: true }).notNull(),
	cityId: integer("city_id").notNull().references(() => cities.cityId, { onDelete: "cascade" } ),
	namaBioskop: text("nama_bioskop").notNull(),
	alamat: text().notNull(),
	mapUrl: text("map_url"),
});

export const cities = sqliteTable("cities", {
	cityId: integer("city_id").primaryKey({ autoIncrement: true }).notNull(),
	cityName: text("city_name").notNull(),
});

export const movieCast = sqliteTable("movie_cast", {
	castId: integer("cast_id").primaryKey({ autoIncrement: true }).notNull(),
	movieId: integer("movie_id").notNull().references(() => movies.movieId, { onDelete: "cascade" } ),
	actorId: integer("actor_id").notNull().references(() => actors.actorId, { onDelete: "cascade" } ),
	characterName: text("character_name").notNull(),
});

export const movies = sqliteTable("movies", {
	movieId: integer("movie_id").primaryKey({ autoIncrement: true }).notNull(),
	title: text().notNull(),
	slug: text().notNull(),
	synopsis: text().notNull(),
	duration: integer().notNull(),
	genre: text().notNull(),
	ratingAge: text("rating_age").notNull(),
	photoUrl: text("photo_url"),
	trailerUrl: text("trailer_url"),
	isPlaying: integer("is_playing").default(false).notNull(),
	createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
	updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
},
(table) => [
	uniqueIndex("movies_slug_unique").on(table.slug),
]);

export const payments = sqliteTable("payments", {
	paymentId: integer("payment_id").primaryKey({ autoIncrement: true }).notNull(),
	bookingId: integer("booking_id").notNull().references(() => bookings.bookingId, { onDelete: "cascade" } ),
	paymentMethod: text("payment_method").notNull(),
	amount: real().notNull(),
	paymentStatus: text("payment_status").default("PENDING"),
	createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
});

export const schedules = sqliteTable("schedules", {
	scheduleId: integer("schedule_id").primaryKey({ autoIncrement: true }).notNull(),
	movieId: integer("movie_id").notNull().references(() => movies.movieId, { onDelete: "cascade" } ),
	studioId: integer("studio_id").notNull().references(() => studios.studioId, { onDelete: "cascade" } ),
	showDate: text("show_date").notNull(),
	showTime: text("show_time").notNull(),
	price: real().notNull(),
	availableSeats: integer("available_seats").notNull(),
});

export const seats = sqliteTable("seats", {
	seatId: integer("seat_id").primaryKey({ autoIncrement: true }).notNull(),
	studioId: integer("studio_id").notNull().references(() => studios.studioId, { onDelete: "cascade" } ),
	seatNumber: text("seat_number").notNull(),
	rowName: text("row_name").notNull(),
	posX: integer("pos_x").notNull(),
	posY: integer("pos_y").notNull(),
});

export const studios = sqliteTable("studios", {
	studioId: integer("studio_id").primaryKey({ autoIncrement: true }).notNull(),
	cinemaId: integer("cinema_id").notNull().references(() => cinemas.cinemaId, { onDelete: "cascade" } ),
	namaStudio: text("nama_studio").notNull(),
	type: text().notNull(),
});

export const users = sqliteTable("users", {
	userId: integer("user_id").primaryKey({ autoIncrement: true }).notNull(),
	fullName: text("full_name").notNull(),
	email: text().notNull(),
	password: text().notNull(),
	phoneNumber: text("phone_number").notNull(),
	jk: text().notNull(),
	tanggalLahir: text("tanggal_lahir").notNull(),
	address: text(),
	photoUrl: text("photo_url"),
	createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
	updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
},
(table) => [
	uniqueIndex("users_phone_number_unique").on(table.phoneNumber),
	uniqueIndex("users_email_unique").on(table.email),
]);

export const admins = sqliteTable("admins", {
	adminId: integer("admin_id").primaryKey({ autoIncrement: true }).notNull(),
	fullName: text("full_name").notNull(),
	email: text().notNull(),
	password: text().notNull(),
	photoUrl: text("photo_url"),
	createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
	updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
},
(table) => [
	uniqueIndex("admins_email_unique").on(table.email),
]);

