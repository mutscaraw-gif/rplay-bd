import { Elysia, t } from "elysia";
import { db } from "../db";
import { studios, seats, schedules, bookingDetails, bookings } from "../db/schema";
import { eq, and, sql } from "drizzle-orm"; // PASTIKAN ADA 'sql' DI SINI

export const studiosRoutes = new Elysia({ prefix: '/studios' })
  // ... (POST, GET, PUT, DELETE tetap sama)

  // --- SEATS GENERATOR ---
  .post("/seats/generate", async ({ body, set }) => {
    try {
      const { studio_id, row_count, seats_per_row } = body;
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const insertData = [];

      for (let i = 0; i < row_count; i++) {
        const rowName = alphabet[i];
        for (let j = 1; j <= seats_per_row; j++) {
          insertData.push({
            studioId: studio_id,
            rowName: rowName,
            seatNumber: `${rowName}${j}`,
            posX: j,
            posY: i + 1,
          });
        }
      }

      const result = await db.insert(seats).values(insertData).returning();
      return { success: true, message: `Sukses! ${result.length} kursi dibuat.` };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal generate kursi.", details: error.message };
    }
  }, {
    body: t.Object({
      studio_id: t.Number(),
      row_count: t.Number({ minimum: 1, maximum: 26 }),
      seats_per_row: t.Number({ minimum: 1 })
    })
  })

  // --- SEATS STATUS (BAGIAN YANG ERROR) ---
  .get("/seats/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const targetId = parseInt(schedule_id);

      // 1. Ambil data jadwal
      const scheduleData = await db.query.schedules.findFirst({ 
        where: eq(schedules.scheduleId, targetId) 
      });

      if (!scheduleData) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // 2. Ambil semua kursi di studio tersebut
      const allSeats = await db.query.seats.findMany({
        where: eq(seats.studioId, scheduleData.studioId),
        orderBy: [seats.rowName, seats.posX]
      });

      // 3. Cari kursi yang sudah dibooking (Hanya yang PENDING atau SUCCESS)
      const bookedSeats = await db.select({ 
          seatId: bookingDetails.seatId 
        })
        .from(bookingDetails)
        .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
        .where(
          and(
            eq(bookings.scheduleId, targetId),
            // Menggunakan sql template agar tidak error tipe data
            sql`${bookings.statusBooking} IN ('PENDING', 'SUCCESS')`
          )
        );

      const bookedIds = new Set(bookedSeats.map(s => s.seatId));

      // 4. Map hasil akhirnya
      const seatMap = allSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_number: seat.seatNumber,
        row_name: seat.rowName,
        pos_x: seat.posX,
        pos_y: seat.posY,
        // Jika seatId ada di dalam daftar bookedIds, maka 'occupied'
        status: bookedIds.has(seat.seatId) ? "occupied" : "available"
      }));

      return { 
        success: true,
        data: {
          schedule_id: targetId,
          studio_id: scheduleData.studioId,
          seats: seatMap
        }
      };

    } catch (error: any) {
      console.error("Error seat status:", error);
      set.status = 500;
      return { error: "Internal Server Error", details: error.message };
    }
  }, {
    params: t.Object({ schedule_id: t.String() })
  });