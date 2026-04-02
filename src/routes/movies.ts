import { Elysia, t } from "elysia";
import { db } from "../db";
import { movies } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export const movieRoutes = new Elysia({ prefix: '/movies' })
  .get("/", async () => {
    return await db.select().from(movies);
  })

  .post("/create", async ({ body, set }) => {
    try {
      const slug = body.slug || body.title.toLowerCase().trim().replace(/\s+/g, '-');
      const [newMovie] = await db.insert(movies).values({
        title: body.title,
        slug: slug,
        synopsis: body.synopsis,
        duration: body.duration,
        genre: body.genre,
        ratingAge: body.rating_age,
        releaseDate: body.release_date,
        endDate: body.end_date,
        photoUrl: body.photo_url,
        trailerUrl: body.trailer_url,
        isPlaying: body.is_playing ?? false,
      }).returning();

      return { success: true, message: "Film berhasil ditambahkan!", data: newMovie };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message?.includes("UNIQUE") ? "Judul/Slug sudah ada" : "Gagal menambah film" };
    }
  }, {
    body: t.Object({
      title: t.String(),
      slug: t.Optional(t.String()),
      synopsis: t.String(),
      duration: t.Number(),
      genre: t.String(),
      rating_age: t.String(),
      release_date: t.String(),
      end_date: t.Optional(t.String()),
      photo_url: t.Optional(t.String()),
      trailer_url: t.Optional(t.String()),
      is_playing: t.Optional(t.Boolean())
    })
  })

  .patch("/update/:id", async ({ params: { id }, body, set }) => {
    try {
      const { photo_url, trailer_url, rating_age, is_playing, release_date, end_date, ...rest } = body;
      const dataUpdate: any = { ...rest };
      
      if (photo_url !== undefined) dataUpdate.photoUrl = photo_url;
      if (trailer_url !== undefined) dataUpdate.trailerUrl = trailer_url;
      if (rating_age !== undefined) dataUpdate.ratingAge = rating_age;
      if (is_playing !== undefined) dataUpdate.isPlaying = is_playing;
      if (release_date !== undefined) dataUpdate.releaseDate = release_date;
      if (end_date !== undefined) dataUpdate.endDate = end_date;
      
      dataUpdate.updatedAt = sql`(datetime('now', 'localtime'))`;

      const [updatedMovie] = await db.update(movies)
        .set(dataUpdate)
        .where(eq(movies.movieId, id as number)) // Paksa tipe ke number karena t.Numeric() sudah menjamin ini angka
        .returning();

      if (!updatedMovie) {
        set.status = 404;
        return { success: false, error: "Film tidak ditemukan" };
      }
      return { success: true, data: updatedMovie };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: "Gagal memperbarui" };
    }
  }, {
    params: t.Object({ id: t.Numeric() }), // t.Numeric otomatis mengubah string ke number
    body: t.Partial(t.Object({
      title: t.String(),
      slug: t.String(),
      synopsis: t.String(),
      duration: t.Number(),
      genre: t.String(),
      rating_age: t.String(),
      release_date: t.String(),
      end_date: t.String(),
      photo_url: t.String(),
      trailer_url: t.String(),
      is_playing: t.Boolean()
    }))
  })

  .delete("/delete/:id", async ({ params: { id }, set }) => {
    try {
      const [deleted] = await db.delete(movies)
        .where(eq(movies.movieId, id as number))
        .returning();
        
      if (!deleted) {
        set.status = 404;
        return { success: false, error: "Film tidak ditemukan" };
      }
      return { success: true, message: "Film berhasil dihapus" };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: "Gagal menghapus" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  });