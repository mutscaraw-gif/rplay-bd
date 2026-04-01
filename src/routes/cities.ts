import { Elysia, t } from "elysia";
import { db } from "../db";
import { cities } from "../db/schema";
import { eq } from "drizzle-orm";

export const citiesRoutes = new Elysia({ prefix: '/cities' })
  .post("/", async ({ body, set }) => {
    try {
      const [newCity] = await db.insert(cities).values({ 
        cityName: body.city_name 
      }).returning();
      set.status = 201;
      return { message: "Kota berhasil ditambahkan", data: newCity };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal menambah kota.", details: error.message };
    }
  }, { body: t.Object({ city_name: t.String({ minLength: 1 }) }) })

  .get("/", async () => await db.select().from(cities))

  .put("/:id", async ({ params: { id }, body, set }) => {
    try {
      const [updatedCity] = await db.update(cities)
        .set({ cityName: body.city_name })
        .where(eq(cities.cityId, id))
        .returning();

      if (!updatedCity) {
        set.status = 404;
        return { error: "Kota tidak ditemukan." };
      }
      return { message: "Kota berhasil diperbarui", data: updatedCity };
    } catch (error: any) {
      set.status = 400;
      return { error: "Gagal memperbarui kota.", details: error.message };
    }
  }, { params: t.Object({ id: t.Numeric() }), body: t.Object({ city_name: t.String() }) })

  .delete("/:id", async ({ params: { id }, set }) => {
    try {
      const [deletedCity] = await db.delete(cities).where(eq(cities.cityId, id)).returning();
      if (!deletedCity) {
        set.status = 404;
        return { error: "Kota tidak ditemukan." };
      }
      return { message: "Kota berhasil dihapus" };
    } catch (error: any) {
      set.status = 500;
      return { error: "Gagal menghapus kota. Pastikan tidak ada bioskop di kota ini.", details: error.message };
    }
  }, { params: t.Object({ id: t.Numeric() }) });