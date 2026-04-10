import { Elysia, t } from "elysia";
import { db } from "../db";
import { seats, bookingDetails, bookings, schedules } from "../db/schema";
import { eq, and, ne, asc } from "drizzle-orm";

export const seatRoutes = new Elysia({ prefix: '/seats' })
  
  /**
   * GET STATUS KURSI
   * Digunakan untuk denah pemilihan kursi oleh user.
   */
  .get("/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const sId = parseInt(schedule_id);

      // 1. Ambil info jadwal dan pastikan jadwal ada
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.scheduleId, sId),
      });

      if (!schedule) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // 2. Ambil SEMUA kursi yang statusnya 'ACTIVE' di studio tersebut
      // Kursi 'INACTIVE' (yang di-disable di Admin) tidak akan dikirim ke user
      const studioSeats = await db.query.seats.findMany({
        where: and(
          eq(seats.studioId, schedule.studioId),
          eq(seats.status, "ACTIVE") // Filter krusial agar kursi disable tidak muncul
        ),
        orderBy: [asc(seats.rowName), asc(seats.seatNumber)]
      });

      // 3. Ambil data booking yang sudah ada untuk jadwal ini
      const reservedSeats = await db
        .select({ seatId: bookingDetails.seatId })
        .from(bookingDetails)
        .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
        .where(
          and(
            eq(bookings.scheduleId, sId),
            ne(bookings.statusBooking, "CANCELLED") 
          )
        );

      const reservedIds = new Set(reservedSeats.map(s => s.seatId));

      // 4. Map data untuk frontend
      return studioSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_name: `${seat.rowName}${seat.seatNumber}`,
        row_name: seat.rowName,
        seat_number: seat.seatNumber,
        // Kursi bisa dipilih jika ID-nya tidak ada di daftar booking (reserved)
        is_available: !reservedIds.has(seat.seatId)
      }));

    } catch (err: any) {
      console.error("Error fetching seat status:", err.message);
      set.status = 500;
      return { error: "Gagal memuat denah kursi" };
    }
  }, {
    params: t.Object({
      schedule_id: t.String()
    })
  });