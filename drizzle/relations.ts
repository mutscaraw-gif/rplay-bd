import { relations } from "drizzle-orm/relations";
import { seats, bookingDetails, bookings, schedules, users, cities, cinemas, actors, movieCast, movies, payments, studios } from "./schema";

export const bookingDetailsRelations = relations(bookingDetails, ({one}) => ({
	seat: one(seats, {
		fields: [bookingDetails.seatId],
		references: [seats.seatId]
	}),
	booking: one(bookings, {
		fields: [bookingDetails.bookingId],
		references: [bookings.bookingId]
	}),
}));

export const seatsRelations = relations(seats, ({one, many}) => ({
	bookingDetails: many(bookingDetails),
	studio: one(studios, {
		fields: [seats.studioId],
		references: [studios.studioId]
	}),
}));

export const bookingsRelations = relations(bookings, ({one, many}) => ({
	bookingDetails: many(bookingDetails),
	schedule: one(schedules, {
		fields: [bookings.scheduleId],
		references: [schedules.scheduleId]
	}),
	user: one(users, {
		fields: [bookings.userId],
		references: [users.userId]
	}),
	payments: many(payments),
}));

export const schedulesRelations = relations(schedules, ({one, many}) => ({
	bookings: many(bookings),
	studio: one(studios, {
		fields: [schedules.studioId],
		references: [studios.studioId]
	}),
	movie: one(movies, {
		fields: [schedules.movieId],
		references: [movies.movieId]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	bookings: many(bookings),
}));

export const cinemasRelations = relations(cinemas, ({one, many}) => ({
	city: one(cities, {
		fields: [cinemas.cityId],
		references: [cities.cityId]
	}),
	studios: many(studios),
}));

export const citiesRelations = relations(cities, ({many}) => ({
	cinemas: many(cinemas),
}));

export const movieCastRelations = relations(movieCast, ({one}) => ({
	actor: one(actors, {
		fields: [movieCast.actorId],
		references: [actors.actorId]
	}),
	movie: one(movies, {
		fields: [movieCast.movieId],
		references: [movies.movieId]
	}),
}));

export const actorsRelations = relations(actors, ({many}) => ({
	movieCasts: many(movieCast),
}));

export const moviesRelations = relations(movies, ({many}) => ({
	movieCasts: many(movieCast),
	schedules: many(schedules),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	booking: one(bookings, {
		fields: [payments.bookingId],
		references: [bookings.bookingId]
	}),
}));

export const studiosRelations = relations(studios, ({one, many}) => ({
	schedules: many(schedules),
	seats: many(seats),
	cinema: one(cinemas, {
		fields: [studios.cinemaId],
		references: [cinemas.cinemaId]
	}),
}));