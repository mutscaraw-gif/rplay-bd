import { Elysia, t } from "elysia";
import { db } from "../db";
import { schedules, seats, movies } from "../db/schema";
import { eq, sql, and, ne, desc } from "drizzle-orm";

export const scheduleRoutes = new Elysia({ prefix: '/schedules' })

  .get("/", async ({ query, set }) => {
    const { movie_id, city_id } = query;
    try {
      const allSchedules = await db.query.schedules.findMany({
        where: movie_id ? eq(schedules.movieId, movie_id) : undefined,
        with: {
          movie: { columns: { movieId: true, title: true, photoUrl: true, duration: true } },
          studio: {
            with: { cinema: { with: { city: true } } }
          }
        },
        orderBy: [desc(schedules.scheduleId)]
      });

      let filtered = allSchedules;
      if (city_id) {
        filtered = allSchedules.filter(s => s.studio?.cinema?.cityId === city_id);
      }

      return filtered.map(s => ({
        schedule_id: s.scheduleId,
        movie: s.movie,
        location: {
          cinema: s.studio?.cinema?.namaBioskop,
          studio: s.studio?.namaStudio,
          city: s.studio?.cinema?.city?.cityName,
        },
        play_at: { date: s.showDate, time: s.showTime },
        price: s.price,
        available_seats: s.availableSeats
      }));
    } catch (error) {
      set.status = 500;
      return { error: "Gagal memuat daftar jadwal" };
    }
  }, {
    query: t.Object({
      movie_id: t.Optional(t.Numeric()),
      city_id: t.Optional(t.Numeric())
    })
  })

  /**
   * POST JADWAL
   */
  .post("/", async ({ body, set }) => {
    const { movie_id, studio_id, show_dates, show_times, price } = body;

    try {
      const movieData = await db.query.movies.findFirst({ where: eq(movies.movieId, movie_id) });
      if (!movieData) {
        set.status = 404;
        return { error: "Film tidak ditemukan." };
      }

      // HITUNG KAPASITAS: Hitung total baris di tabel seats untuk studio ini
      const [seatCount] = await db
        .select({ count: sql`count(*)` })
        .from(seats)
        .where(eq(seats.studioId, studio_id));

      const totalSeats = Number(seatCount?.count) || 0;
      const duration = movieData.duration;

      const insertData: any[] = [];
      const conflicts: string[] = [];

      for (const date of show_dates) {
        const existingSchedules = await db.query.schedules.findMany({
          where: and(eq(schedules.studioId, studio_id), eq(schedules.showDate, date))
        });

        for (const time of show_times) {
          const isOverlap = existingSchedules.some(s => {
            const startNew = time;
            const endNew = addMinutes(time, duration + 20);
            const startOld = s.showTime;
            const endOld = addMinutes(s.showTime, duration + 20);
            return (startNew < endOld && endNew > startOld);
          });

          if (isOverlap) {
            conflicts.push(`Bentrok: ${date} @ ${time}`);
            continue;
          }

          insertData.push({
            movieId: movie_id,
            studioId: studio_id,
            showDate: date,
            showTime: time,
            price: price,
            availableSeats: totalSeats // Mengisi kapasitas berdasarkan jumlah kursi di DB
          });
        }
      }

      if (insertData.length > 0) {
        await db.insert(schedules).values(insertData);
      }

      return { 
        message: `Berhasil menerbitkan ${insertData.length} jadwal.`,
        skipped_conflicts: conflicts 
      };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal membuat jadwal", detail: error.message };
    }
  }, {
    body: t.Object({
      movie_id: t.Number(),
      studio_id: t.Number(),
      show_dates: t.Array(t.String()),
      show_times: t.Array(t.String()),
      price: t.Number(),
    })
  })

  /**
   * UPDATE JADWAL
   */
  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const { movie_id, studio_id, show_date, show_time, price } = body;

      const current = await db.query.schedules.findFirst({ where: eq(schedules.scheduleId, id) });
      if (!current) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan." };
      }

      const movieData = await db.query.movies.findFirst({ where: eq(movies.movieId, movie_id) });
      const duration = movieData?.duration || 120;

      // Cek bentrok
      const conflict = await db.query.schedules.findFirst({
        where: and(
          eq(schedules.studioId, studio_id),
          eq(schedules.showDate, show_date),
          ne(schedules.scheduleId, id),
          sql`(${show_time} < time(${schedules.showTime}, '+' || ${duration + 20} || ' minutes'))`,
          sql`(time(${show_time}, '+' || ${duration + 20} || ' minutes') > ${schedules.showTime})`
        )
      });

      if (conflict) {
        set.status = 400;
        return { error: "Waktu bentrok dengan jadwal lain." };
      }

      let updatedSeats = current.availableSeats;
      // Jika studio ganti, hitung ulang kapasitas total kursi
      if (studio_id !== current.studioId) {
        const [seatCount] = await db
          .select({ count: sql`count(*)` })
          .from(seats)
          .where(eq(seats.studioId, studio_id));
        updatedSeats = Number(seatCount?.count) || 0;
      }

      const [updated] = await db.update(schedules)
        .set({ 
          movieId: movie_id, 
          studioId: studio_id, 
          showDate: show_date, 
          showTime: show_time, 
          price, 
          availableSeats: updatedSeats 
        })
        .where(eq(schedules.scheduleId, id))
        .returning();

      return { message: "Jadwal berhasil diperbarui", data: updated };
    } catch (error) {
      set.status = 500;
      return { error: "Gagal memperbarui jadwal" };
    }
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      movie_id: t.Number(),
      studio_id: t.Number(),
      show_date: t.String(),
      show_time: t.String(),
      price: t.Number(),
    })
  })

  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const existing = await db.query.schedules.findFirst({ where: eq(schedules.scheduleId, id) });
      if (!existing) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan." };
      }
      await db.delete(schedules).where(eq(schedules.scheduleId, id));
      return { message: "Jadwal berhasil dihapus" };
    } catch (error) {
      set.status = 500;
      return { error: "Gagal menghapus jadwal" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  });

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m + mins);
  return date.toTimeString().slice(0, 5);
}