import { Elysia, t } from "elysia";
import { db } from "../db";
import { movies } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export const movieRoutes = new Elysia({ prefix: '/movies' })
  
  // 1. GET ALL MOVIES (Untuk List di Mobile/Web)
  .get("/", async () => {
    return await db.select().from(movies);
  })

  // 2. CREATE MOVIE
  .post("/create", async ({ body, set }) => {
    try {
      const slug = body.slug || body.title.toLowerCase().trim().replace(/\s+/g, '-');
      
      const result = await db.insert(movies).values({
        title: body.title,
        slug: slug,
        synopsis: body.synopsis,
        duration: body.duration,
        genre: body.genre,
        ratingAge: body.rating_age,
        photoUrl: body.photo_url,
        trailerUrl: body.trailer_url,
        isPlaying: body.is_playing ?? false,
      }).returning();

      return { message: "Film berhasil ditambahkan!", data: result[0] };
    } catch (err: any) {
      set.status = 400;
      if (err.message?.includes("UNIQUE")) {
        return { error: "Gagal! Judul atau Slug sudah ada." };
      }
      return { error: "Gagal menambah film. Periksa inputan Anda." };
    }
  }, {
    body: t.Object({
      title: t.String(),
      slug: t.Optional(t.String()),
      synopsis: t.String(),
      duration: t.Number(),
      genre: t.String(),
      rating_age: t.String(),
      photo_url: t.Optional(t.String()),
      trailer_url: t.Optional(t.String()),
      is_playing: t.Optional(t.Boolean())
    })
  })

  // 3. UPDATE MOVIE (PATCH)
  .patch("/update/:id", async ({ params: { id }, body, set }) => {
    try {
      const { photo_url, trailer_url, rating_age, is_playing, ...rest } = body;
      
      // Mapping body ke format database (camelCase)
      const dataUpdate: any = { ...rest };
      if (photo_url !== undefined) dataUpdate.photoUrl = photo_url;
      if (trailer_url !== undefined) dataUpdate.trailerUrl = trailer_url;
      if (rating_age !== undefined) dataUpdate.ratingAge = rating_age;
      if (is_playing !== undefined) dataUpdate.isPlaying = is_playing;
      
      dataUpdate.updatedAt = sql`CURRENT_TIMESTAMP`;

      // Auto-update slug jika judul berubah
      if (body.title && !body.slug) {
        dataUpdate.slug = body.title.toLowerCase().trim().replace(/\s+/g, '-');
      }

      const result = await db.update(movies)
        .set(dataUpdate)
        .where(eq(movies.movieId, parseInt(id)))
        .returning();

      if (result.length === 0) {
        set.status = 404;
        return { error: "Film tidak ditemukan" };
      }

      return { message: "Data film berhasil diperbarui", data: result[0] };
    } catch (err) {
      set.status = 500;
      return { error: "Gagal memperbarui film." };
    }
  }, {
    body: t.Partial(t.Object({
      title: t.String(),
      slug: t.String(),
      synopsis: t.String(),
      duration: t.Number(),
      genre: t.String(),
      rating_age: t.String(),
      photo_url: t.String(),
      trailer_url: t.String(),
      is_playing: t.Boolean()
    }))
  })

  // 4. DELETE MOVIE
  .delete("/delete/:id", async ({ params: { id }, set }) => {
    const result = await db.delete(movies)
      .where(eq(movies.movieId, parseInt(id)))
      .returning();
      
    if (result.length === 0) {
      set.status = 404;
      return { error: "Film tidak ditemukan" };
    }
    return { message: "Film berhasil dihapus" };
  });