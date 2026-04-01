import { Elysia, t } from "elysia";
import { db } from "../db";
import { actors } from "../db/schema";
import { eq } from "drizzle-orm";

export const actorsRoutes = new Elysia({ prefix: '/actors' })
  .get("/", async () => await db.select().from(actors))
  
  .post("/", async ({ body, set }) => {
    try {
      const [newActor] = await db.insert(actors).values({
        actorName: body.actor_name, // Map secara manual agar tidak error
        photoUrl: body.photo_url
      }).returning();
      set.status = 201;
      return newActor;
    } catch (error: any) {
      set.status = 400;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      actor_name: t.String(),
      photo_url: t.Optional(t.String())
    })
  })
  
  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updated] = await db.update(actors)
        .set({
          actorName: body.actor_name,
          photoUrl: body.photo_url
        })
        .where(eq(actors.actorId, id))
        .returning();
      
      if (!updated) { set.status = 404; return { error: "Tidak ditemukan" }; }
      return updated;
    } catch (error: any) {
       set.status = 400; return { error: error.message };
    }
  }, { 
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      actor_name: t.String(),
      photo_url: t.Optional(t.String())
    })
  })
  
  .delete("/:id", async ({ params: { id } }) => {
    await db.delete(actors).where(eq(actors.actorId, id));
    return { message: "Aktor berhasil dihapus" };
  }, { params: t.Object({ id: t.Numeric() }) });