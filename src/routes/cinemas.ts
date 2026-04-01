import { Elysia, t } from "elysia";
import { db } from "../db";
import { cinemas } from "../db/schema";
import { eq } from "drizzle-orm";

export const cinemasRoutes = new Elysia({ prefix: '/cinemas' })
  .post("/", async ({ body, set }) => {
    try {
      const [newCinema] = await db.insert(cinemas).values({
        cityId: body.city_id,
        namaBioskop: body.nama_bioskop,
        alamat: body.alamat,
        mapUrl: body.map_url
      }).returning();
      set.status = 201;
      return { message: "Bioskop berhasil ditambahkan", data: newCinema };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal menambah bioskop.", details: error.message };
    }
  }, {
    body: t.Object({
      city_id: t.Number(),
      nama_bioskop: t.String(),
      alamat: t.String(),
      map_url: t.Optional(t.String())
    })
  })

  .get("/", async () => {
    return await db.query.cinemas.findMany({ with: { city: true } });
  })

  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updatedCinema] = await db.update(cinemas)
        .set({
          cityId: body.city_id,
          namaBioskop: body.nama_bioskop,
          alamat: body.alamat,
          mapUrl: body.map_url,
        })
        .where(eq(cinemas.cinemaId, id))
        .returning();

      if (!updatedCinema) {
        set.status = 404;
        return { error: "Bioskop tidak ditemukan." };
      }
      return { message: "Data bioskop berhasil diperbarui", data: updatedCinema };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal memperbarui bioskop.", details: error.message };
    }
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      city_id: t.Number(),
      nama_bioskop: t.String(),
      alamat: t.String(),
      map_url: t.Optional(t.String())
    })
  })

  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const [deletedCinema] = await db.delete(cinemas).where(eq(cinemas.cinemaId, id)).returning();
      if (!deletedCinema) {
        set.status = 404;
        return { error: "Bioskop tidak ditemukan." };
      }
      return { message: "Bioskop berhasil dihapus" };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal menghapus bioskop. Cek relasi studio.", details: error.message };
    }
  }, { params: t.Object({ id: t.Numeric() }) });