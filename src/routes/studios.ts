import { Elysia, t } from "elysia";
import { db } from "../db";
import { studios, seats, schedules, bookingDetails, bookings } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";

export const studiosRoutes = new Elysia({ prefix: '/studios' })
  
  /**
   * 1. GET ALL STUDIOS
   */
  .get("/", async () => {
    return await db.query.studios.findMany({
      with: { cinema: true }
    });
  })

  /**
   * 2. GET STUDIO BY ID
   */
  .get("/:id", async ({ params: { id }, set }) => {
    const result = await db.query.studios.findFirst({
      where: eq(studios.studioId, Number(id)),
      with: { cinema: true }
    });

    if (!result) {
      set.status = 404;
      return { error: "Studio tidak ditemukan" };
    }
    return result;
  }, {
    params: t.Object({ id: t.Numeric() })
  })

  /**
   * 3. CREATE NEW STUDIO
   * Sinkron dengan kolom 'type' di database
   */
  .post("/", async ({ body, set }) => {
    try {
      const [newStudio] = await db.insert(studios).values({
        cinemaId: body.cinema_id,
        namaStudio: body.nama_studio,
        type: body.type, 
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
      type: t.String({ description: "Contoh: 2D, IMAX, Premiere" }) 
    })
  })

  /**
   * 4. UPDATE STUDIO
   */
  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updated] = await db.update(studios)
        .set({
          cinemaId: body.cinema_id,
          namaStudio: body.nama_studio,
          type: body.type
        })
        .where(eq(studios.studioId, Number(id)))
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
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      cinema_id: t.Number(),
      nama_studio: t.String(),
      type: t.String()
    })
  })

  /**
   * 5. DELETE STUDIO
   */
  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const [deleted] = await db.delete(studios)
        .where(eq(studios.studioId, Number(id)))
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
  }, {
    params: t.Object({ id: t.Numeric() })
  })

  /**
   * 6. SEATS STATUS
   */
  .get("/seats/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const targetId = Number(schedule_id);

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
      set.status = 500;
      return { error: "Gagal memuat status kursi", details: error.message };
    }
  }, {
    params: t.Object({ schedule_id: t.Numeric() })
  })
  /**
   * 7. GET SEATS BY STUDIO ID
   */
  .get("/:id/seats", async ({ params: { id }, set }) => {
    try {
      return await db.query.seats.findMany({
        where: eq(seats.studioId, Number(id)),
        orderBy: [sql`${seats.rowName} ASC`, sql`${seats.posX} ASC`]
      });
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal mengambil data kursi", details: error.message };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  })

  /**
   * 8. UPDATE/GENERATE SEATS
   */
  .post("/seats/generate", async ({ body, set }) => {
    try {
      const { studio_id, row_count, seats_per_row, inactive_seats } = body;
      
      // Gunakan transaksi agar jika gagal generate, data lama tidak hilang permanen
      return await db.transaction(async (tx) => {
        // Hapus data lama
        await tx.delete(seats).where(eq(seats.studioId, studio_id));

        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const insertData = [];

        for (let i = 0; i < row_count; i++) {
          const rowName = alphabet[i];
          for (let j = 1; j <= seats_per_row; j++) {
            const seatKey = `${rowName}${j}`;
            
            // Hanya masukkan kursi yang BUKAN merupakan lorong (inactive)
            if (!inactive_seats.includes(seatKey)) {
              insertData.push({
                studioId: studio_id,
                rowName: rowName,
                seatNumber: `${j}`,
                posX: j,
                posY: i + 1,
              });
            }
          }
        }

        if (insertData.length > 0) {
          await tx.insert(seats).values(insertData);
        }

        return { 
          success: true, 
          message: `Layout diperbarui. ${insertData.length} kursi aktif dibuat.` 
        };
      });

    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal memperbarui layout.", details: error.message };
    }
  }, {
    body: t.Object({
      studio_id: t.Number(),
      row_count: t.Number({ minimum: 1, maximum: 26 }),
      seats_per_row: t.Number({ minimum: 1 }),
      inactive_seats: t.Array(t.String()) // Terima data kursi yang di-klik Admin sebagai lorong
    })
  })