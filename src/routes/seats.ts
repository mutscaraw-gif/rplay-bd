import { Elysia, t } from "elysia";
import { db } from "../db";
import { seats, bookingDetails, bookings, schedules } from "../db/schema";
import { eq, and, ne, asc } from "drizzle-orm";

export const seatRoutes = new Elysia({ prefix: '/seats' })
  
  /**
   * GET STATUS KURSI (Final Version)
   * Logika: Jika data kursi ada di tabel 'seats', maka kursi tersebut aktif.
   * Ketersediaan (is_available) ditentukan oleh relasi ke tabel booking.
   */
  .get("/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const sId = parseInt(schedule_id);
      if (isNaN(sId)) {
        set.status = 400;
        return { error: "ID Jadwal tidak valid" };
      }

      // 1. Ambil info jadwal untuk mendapatkan studio_id
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.scheduleId, sId),
      });

      if (!schedule) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // 2. Ambil SEMUA kursi yang terdaftar di studio tersebut secara paralel
      // Kursi yang di-disable admin sudah dihapus dari DB, jadi tidak perlu filter 'status'
      const [studioSeats, reservedSeats] = await Promise.all([
        db.query.seats.findMany({
          where: eq(seats.studioId, schedule.studioId),
          orderBy: [asc(seats.rowName), asc(seats.seatNumber)]
        }),
        db
          .select({ seatId: bookingDetails.seatId })
          .from(bookingDetails)
          .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
          .where(
            and(
              eq(bookings.scheduleId, sId),
              ne(bookings.statusBooking, "CANCELLED") 
            )
          )
      ]);

      // 3. Gunakan Set untuk lookup O(1) yang cepat
      const reservedIds = new Set(reservedSeats.map(s => s.seatId));

      // 4. Transformasi data untuk kebutuhan UI frontend
      return studioSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_name: `${seat.rowName}${seat.seatNumber}`,
        row_name: seat.rowName,
        seat_number: seat.seatNumber,
        // Kursi tersedia hanya jika tidak ada di daftar reservedIds
        is_available: !reservedIds.has(seat.seatId)
      }));

    } catch (err: any) {
      console.error("Critical Error [seat-status]:", err.message);
      set.status = 500;
      return { error: "Gagal menyinkronkan denah kursi" };
    }
  }, {
    params: t.Object({
      schedule_id: t.String()
    })
  });