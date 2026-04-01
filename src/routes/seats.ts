// routes/seats.ts
import { Elysia, t } from "elysia";
import { db } from "../db";
import { seats, bookingDetails, bookings, schedules } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const seatRoutes = new Elysia({ prefix: '/seats' })
  
  // Endpoint CRITICAL: Cek kursi mana yang sudah dipesan untuk jadwal tertentu
  .get("/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const sId = parseInt(schedule_id);

      // 1. Ambil data jadwal untuk tahu studio mana
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.scheduleId, sId)
      });

      if (!schedule) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // 2. Ambil SEMUA kursi di studio tersebut
      const allSeats = await db.query.seats.findMany({
        where: eq(seats.studioId, schedule.studioId)
      });

      // 3. Ambil ID kursi yang sudah di-BOOKED untuk jadwal ini
      const booked = await db.select({ seatId: bookingDetails.seatId })
        .from(bookingDetails)
        .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
        .where(
          and(
            eq(bookings.scheduleId, sId),
            eq(bookings.statusBooking, "SUCCESS") // Hanya yang sudah bayar/sukses
          )
        );

      const bookedIds = booked.map(b => b.seatId);

      // 4. Gabungkan data
      return allSeats.map(seat => ({
        ...seat,
        isAvailable: !bookedIds.includes(seat.seatId)
      }));

    } catch (err) {
      set.status = 500;
      return { error: "Gagal memuat status kursi" };
    }
  });