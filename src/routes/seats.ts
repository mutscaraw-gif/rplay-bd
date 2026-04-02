import { Elysia, t } from "elysia";
import { db } from "../db";
import { seats, bookingDetails, bookings, schedules } from "../db/schema";
import { eq, and, ne } from "drizzle-orm";

export const seatRoutes = new Elysia({ prefix: '/seats' })
  
  /**
   * GET STATUS KURSI
   * Mengambil semua denah kursi di studio terkait dan mengecek mana yang sudah terisi.
   */
  .get("/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const sId = parseInt(schedule_id);

      // 1. Validasi Jadwal & Dapatkan Studio ID
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.scheduleId, sId),
        columns: { studioId: true }
      });

      if (!schedule) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // 2. Ambil Semua Kursi yang ada di Studio tersebut
      const allSeats = await db.query.seats.findMany({
        where: eq(seats.studioId, schedule.studioId),
        orderBy: [seats.rowName, seats.seatNumber] // Urutkan agar rapi di frontend
      });

      // 3. Ambil Kursi yang SUDAH TERISI (Booked)
      // Logika: Kursi dianggap terisi jika statusnya BUKAN 'CANCELLED'
      // Ini mencakup status 'SUCCESS' dan 'PENDING'
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

      // Gunakan Set untuk performa pengecekan ID yang lebih cepat
      const reservedIds = new Set(reservedSeats.map(s => s.seatId));

      // 4. Mapping Data Akhir
      return allSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_number: seat.seatNumber,
        row_name: seat.rowName,
        position: {
            x: seat.posX,
            y: seat.posY
        },
        // Kursi tersedia hanya jika ID-nya tidak ada di daftar reservedIds
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