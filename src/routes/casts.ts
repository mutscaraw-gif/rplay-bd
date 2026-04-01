import { Elysia, t } from "elysia";
import { db } from "../db";
import { Cast } from "../db/schema"; 
import { eq } from "drizzle-orm";

export const castsRoutes = new Elysia({ prefix: '/casts' })
  // --- CREATE ---
  .post("/", async ({ body, set }) => {
    try {
      const [newCast] = await db.insert(Cast).values({
        movieId: body.movie_id,
        actorId: body.actor_id,
        characterName: body.character_name,
        photoUrl: body.photo_url 
      }).returning();
      
      set.status = 201;
      return newCast;
    } catch (e: any) {
      set.status = 400;
      return { error: "Gagal menambah cast", details: e.message };
    }
  }, {
    body: t.Object({
      movie_id: t.Number(),
      actor_id: t.Number(),
      character_name: t.String(),
      photo_url: t.Optional(t.String()) 
    })
  })

  // --- GET SINGLE CAST BY ID (Baru) ---
  .get("/", async () => {
  // Mengambil semua data dari tabel Cast
  return await db.query.Cast.findMany({
    with: {
      actor: true 
    }
  });
})

  // --- GET ALL CASTS FOR A MOVIE ---
  .get("/movie/:movieId", async ({ params: { movieId } }) => {
    return await db.query.Cast.findMany({
      where: eq(Cast.movieId, movieId),
      with: {
        actor: true 
      }
    });
  }, { params: t.Object({ movieId: t.Numeric() }) })

  // --- UPDATE (PUT) (Baru) ---
  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updatedCast] = await db.update(Cast)
        .set({
          movieId: body.movie_id,
          actorId: body.actor_id,
          characterName: body.character_name,
          photoUrl: body.photo_url
        })
        .where(eq(Cast.castId, id))
        .returning();

      if (!updatedCast) {
        set.status = 404;
        return { error: "Cast tidak ditemukan untuk diupdate" };
      }

      return updatedCast;
    } catch (e: any) {
      set.status = 400;
      return { error: "Gagal update cast", details: e.message };
    }
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      movie_id: t.Optional(t.Number()),
      actor_id: t.Optional(t.Number()),
      character_name: t.Optional(t.String()),
      photo_url: t.Optional(t.String())
    })
  })

  // --- DELETE ---
  .delete("/:id", async ({ params: { id } }) => {
    await db.delete(Cast).where(eq(Cast.castId, id));
    return { message: "Pemeran dihapus dari film" };
  }, { params: t.Object({ id: t.Numeric() }) });