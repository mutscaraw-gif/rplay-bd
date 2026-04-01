import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ==========================================
// 1. DEFINISI SEMUA TABEL (Tanpa Relasi Dulu)
// ==========================================

export const admins = sqliteTable("admins", {
  adminId: integer("admin_id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  photoUrl: text("photo_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  userId: integer("user_id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  phoneNumber: text("phone_number").unique().notNull(),
  jk: text("jk").$type<'L' | 'P'>().notNull(),
  tanggalLahir: text("tanggal_lahir").notNull(),
  address: text("address"),
  photoUrl: text("photo_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const movies = sqliteTable("movies", {
  movieId: integer("movie_id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  synopsis: text("synopsis").notNull(),
  duration: integer("duration").notNull(),
  genre: text("genre").notNull(),
  ratingAge: text("rating_age").notNull(),
  photoUrl: text("photo_url"),
  trailerUrl: text("trailer_url"),
  isPlaying: integer("is_playing", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const cities = sqliteTable("cities", {
  cityId: integer("city_id").primaryKey({ autoIncrement: true }),
  cityName: text("city_name").notNull(),
});

export const cinemas = sqliteTable("cinemas", {
  cinemaId: integer("cinema_id").primaryKey({ autoIncrement: true }),
  cityId: integer("city_id").notNull().references(() => cities.cityId, { onDelete: 'cascade' }),
  namaBioskop: text("nama_bioskop").notNull(),
  alamat: text("alamat").notNull(),
  mapUrl: text("map_url"),
});

export const studios = sqliteTable("studios", {
  studioId: integer("studio_id").primaryKey({ autoIncrement: true }),
  cinemaId: integer("cinema_id").notNull().references(() => cinemas.cinemaId, { onDelete: 'cascade' }),
  namaStudio: text("nama_studio").notNull(),
  type: text("type").notNull(),
});

export const actors = sqliteTable("actors", {
  actorId: integer("actor_id").primaryKey({ autoIncrement: true }),
  actorName: text("actor_name").notNull(),
  photoUrl: text("photo_url"),
});

export const Cast = sqliteTable("cast", {
  castId: integer("cast_id").primaryKey({ autoIncrement: true }),
  movieId: integer("movie_id").notNull().references(() => movies.movieId, { onDelete: 'cascade' }),
  actorId: integer("actor_id").notNull().references(() => actors.actorId, { onDelete: 'cascade' }),
  characterName: text("character_name").notNull(),
  photoUrl: text("photo_url"),
});

export const seats = sqliteTable("seats", {
  seatId: integer("seat_id").primaryKey({ autoIncrement: true }),
  studioId: integer("studio_id").notNull().references(() => studios.studioId, { onDelete: 'cascade' }),
  seatNumber: text("seat_number").notNull(),
  rowName: text("row_name").notNull(),
  posX: integer("pos_x").notNull(),
  posY: integer("pos_y").notNull(),
});

export const schedules = sqliteTable("schedules", {
  scheduleId: integer("schedule_id").primaryKey({ autoIncrement: true }),
  movieId: integer("movie_id").notNull().references(() => movies.movieId, { onDelete: 'cascade' }),
  studioId: integer("studio_id").notNull().references(() => studios.studioId, { onDelete: 'cascade' }),
  showDate: text("show_date").notNull(),
  showTime: text("show_time").notNull(),
  price: real("price").notNull(),
  availableSeats: integer("available_seats").notNull(),
});

export const bookings = sqliteTable("bookings", {
  bookingId: integer("booking_id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: 'cascade' }),
  scheduleId: integer("schedule_id").notNull().references(() => schedules.scheduleId, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull(),
  totalPrice: real("total_price").notNull(),
  statusBooking: text("status_booking", { enum: ["PENDING", "SUCCESS", "CANCELLED"] }).default("PENDING"),
  isUsed: integer("is_used", { mode: "boolean" }).default(false), // Penting untuk Scan Admin
  paymentLimit: text("payment_limit"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const bookingDetails = sqliteTable("booking_details", {
  detailId: integer("detail_id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id").notNull().references(() => bookings.bookingId, { onDelete: 'cascade' }),
  seatId: integer("seat_id").notNull().references(() => seats.seatId, { onDelete: 'cascade' }),
  statusSeat: text("status_seat", { enum: ["BOOKED", "AVAILABLE"] }).default("BOOKED"),
});

export const payments = sqliteTable("payments", {
  paymentId: integer("payment_id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id").notNull().references(() => bookings.bookingId, { onDelete: 'cascade' }),
  externalId: text("external_id").notNull().default("TEMP_ID"),
  checkoutUrl: text("checkout_url"), // Ini boleh null, jadi aman
  paymentMethod: text("payment_method").notNull(),
  amount: real("amount").notNull(),
  paymentStatus: text("payment_status", { enum: ["PENDING", "PAID", "EXPIRED"] }).default("PENDING"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// ==========================================
// 2. DEFINISI RELASI (Setalah Semua Tabel Ada)
// ==========================================

export const citiesRelations = relations(cities, ({ many }) => ({
  cinemas: many(cinemas),
}));

export const cinemasRelations = relations(cinemas, ({ one, many }) => ({
  city: one(cities, { fields: [cinemas.cityId], references: [cities.cityId] }),
  studios: many(studios),
}));

export const studiosRelations = relations(studios, ({ one, many }) => ({
  cinema: one(cinemas, { fields: [studios.cinemaId], references: [cinemas.cinemaId] }),
  seats: many(seats),
  schedules: many(schedules),
}));

export const moviesRelations = relations(movies, ({ many }) => ({
  casts: many(Cast),
  schedules: many(schedules),
}));

export const actorsRelations = relations(actors, ({ many }) => ({
  movieCasts: many(Cast),
}));

export const movieCastRelations = relations(Cast, ({ one }) => ({
  movie: one(movies, { 
    fields: [Cast.movieId], 
    references: [movies.movieId] 
  }),
  actor: one(actors, { 
    fields: [Cast.actorId], 
    references: [actors.actorId] 
  }),
}));

export const seatsRelations = relations(seats, ({ one, many }) => ({
  studio: one(studios, { fields: [seats.studioId], references: [studios.studioId] }),
  bookingDetails: many(bookingDetails),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  movie: one(movies, { fields: [schedules.movieId], references: [movies.movieId] }),
  studio: one(studios, { fields: [schedules.studioId], references: [studios.studioId] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.userId] }),
  schedule: one(schedules, { fields: [bookings.scheduleId], references: [schedules.scheduleId] }),
  details: many(bookingDetails),
  payment: one(payments, { fields: [bookings.bookingId], references: [payments.bookingId] }),
}));

export const bookingDetailsRelations = relations(bookingDetails, ({ one }) => ({
  booking: one(bookings, { fields: [bookingDetails.bookingId], references: [bookings.bookingId] }),
  seat: one(seats, { fields: [bookingDetails.seatId], references: [seats.seatId] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.bookingId] }),
}));