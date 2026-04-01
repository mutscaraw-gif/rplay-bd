import { Elysia, t } from "elysia";
import { db } from "../db";
import { studios, seats, schedules, bookingDetails, bookings } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const studiosRoutes = new Elysia({ prefix: '/studios' })
  .post("/", async ({ body, set }) => {
    try {
      const [newStudio] = await db.insert(studios).values({
        cinemaId: body.cinema_id,
        namaStudio: body.nama_studio,
        type: body.type
      }).returning();
      set.status = 201;
      return { message: "Studio berhasil ditambahkan", data: newStudio };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal menambah studio.", details: error.message };
    }
  }, {
    body: t.Object({
      cinema_id: t.Number(),
      nama_studio: t.String(),
      type: t.String()
    })
  })

  .get("/", async () => {
    return await db.query.studios.findMany({
      with: { cinema: { with: { city: true } } }
    });
  })

  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updatedStudio] = await db.update(studios)
        .set({
          cinemaId: body.cinema_id,
          namaStudio: body.nama_studio,
          type: body.type
        })
        .where(eq(studios.studioId, id))
        .returning();

      if (!updatedStudio) {
        set.status = 404;
        return { error: "Studio tidak ditemukan." };
      }
      return { message: "Studio berhasil diperbarui", data: updatedStudio };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal memperbarui studio.", details: error.message };
    }
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      cinema_id: t.Number(),
      nama_studio: t.String(),
      type: t.String()
    })
  })

  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const [deletedStudio] = await db.delete(studios).where(eq(studios.studioId, id)).returning();
      if (!deletedStudio) {
        set.status = 404;
        return { error: "Studio tidak ditemukan." };
      }
      return { message: "Studio berhasil dihapus" };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal menghapus studio. Cek relasi kursi.", details: error.message };
    }
  }, { params: t.Object({ id: t.Numeric() }) })

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
      return { message: `Sukses! ${result.length} kursi dibuat.`, layout: `${row_count}x${seats_per_row}` };
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

  // --- SEATS STATUS ---
  .get("/seats/status/:schedule_id", async ({ params: { schedule_id }, set }) => {
    try {
      const targetId = parseInt(schedule_id);
      const scheduleData = await db.query.schedules.findFirst({ where: eq(schedules.scheduleId, targetId) });

      if (!scheduleData) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      const allSeats = await db.query.seats.findMany({
        where: eq(seats.studioId, scheduleData.studioId),
        orderBy: [seats.rowName, seats.posX]
      });

      const bookedSeats = await db.select({ seatId: bookingDetails.seatId })
        .from(bookingDetails)
        .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
        .where(and(eq(bookings.scheduleId, targetId), eq(bookingDetails.statusSeat, "BOOKED")));

      const bookedIds = bookedSeats.map(s => s.seatId);
      const seatMap = allSeats.map(seat => ({
        ...seat,
        status: bookedIds.includes(seat.seatId) ? "occupied" : "available"
      }));

      return { schedule_id: targetId, studio_id: scheduleData.studioId, seats: seatMap };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal ambil status kursi", details: error.message };
    }
  });