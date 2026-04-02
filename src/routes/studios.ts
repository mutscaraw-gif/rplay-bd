import { Elysia, t } from "elysia";
import { db } from "../db";
import { studios, seats, schedules, bookingDetails, bookings } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";

export const studiosRoutes = new Elysia({ prefix: '/studios' })
  
  // 1. GET ALL STUDIOS
  .get("/", async () => {
    return await db.query.studios.findMany({
      with: { cinema: true } // Mengambil data bioskop terkait jika ada relasi
    });
  })

  // 2. GET STUDIO BY ID
  .get("/:id", async ({ params: { id }, set }) => {
    const result = await db.query.studios.findFirst({
      where: eq(studios.studioId, parseInt(id)),
      with: { cinema: true }
    });
    if (!result) {
      set.status = 404;
      return { error: "Studio tidak ditemukan" };
    }
    return result;
  })

  // 3. CREATE NEW STUDIO
  .post("/", async ({ body, set }) => {
    try {
      const [newStudio] = await db.insert(studios).values({
        cinemaId: body.cinema_id,
        namaStudio: body.nama_studio,
        tipeStudio: body.tipe_studio, // E.g., 'IMAX', 'PREMIERE', 'REGULAR'
      }).returning();
      
      set.status = 201;
      return { success: true, data: newStudio };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal membuat studio", details: error.message };
    }
  }, {
    body: t.Object({
      cinema_id: t.Number(),
      nama_studio: t.String(),
      tipe_studio: t.String()
    })
  })

  // 4. UPDATE STUDIO
  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updated] = await db.update(studios)
        .set({
          cinemaId: body.cinema_id,
          namaStudio: body.nama_studio,
          tipeStudio: body.tipe_studio
        })
        .where(eq(studios.studioId, parseInt(id)))
        .returning();

      if (!updated) {
        set.status = 404;
        return { error: "Studio tidak ditemukan" };
      }
      return { success: true, data: updated };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal update studio", details: error.message };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      cinema_id: t.Number(),
      nama_studio: t.String(),
      tipe_studio: t.String()
    })
  })

  // 5. DELETE STUDIO
  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const [deleted] = await db.delete(studios)
        .where(eq(studios.studioId, parseInt(id)))
        .returning();

      if (!deleted) {
        set.status = 404;
        return { error: "Studio tidak ditemukan" };
      }
      return { success: true, message: "Studio berhasil dihapus" };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal menghapus studio", details: error.message };
    }
  })

  // 6. SEATS GENERATOR (Logika Anda sebelumnya)
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

  // 7. SEATS STATUS (Logika Anda sebelumnya yang sudah diperbaiki)
  .get("/seats/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const targetId = parseInt(schedule_id);

      const scheduleData = await db.query.schedules.findFirst({ 
        where: eq(schedules.scheduleId, targetId) 
      });

      if (!scheduleData) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      const allSeats = await db.query.seats.findMany({
        where: eq(seats.studioId, scheduleData.studioId),
        orderBy: [seats.rowName, seats.posX]
      });

      const bookedSeats = await db.select({ 
          seatId: bookingDetails.seatId 
        })
        .from(bookingDetails)
        .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
        .where(
          and(
            eq(bookings.scheduleId, targetId),
            sql`${bookings.statusBooking} IN ('PENDING', 'SUCCESS')`
          )
        );

      const bookedIds = new Set(bookedSeats.map(s => s.seatId));

      const seatMap = allSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_number: seat.seatNumber,
        row_name: seat.rowName,
        pos_x: seat.posX,
        pos_y: seat.posY,
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