import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { eq, or, sql } from "drizzle-orm";

// Export dengan nama userRoutes agar bisa di-import di index.ts
export const userRoutes = new Elysia({ prefix: '/akun' })

  // --- REGISTER ---
  .post("/register", async ({ body, set }) => {
    try {
      const hashedPassword = await Bun.password.hash(body.password);
      
      const [newUser] = await db.insert(users).values({
        fullName: body.full_name,
        email: body.email,
        password: hashedPassword,
        phoneNumber: body.phone_number,
        jk: body.jk as 'L' | 'P',
        tanggalLahir: body.tanggal_lahir,
        photoUrl: body.photo_url,
      }).returning();

      const { password: _, ...safeUser } = newUser;
      return { message: "Registrasi Berhasil!", user: safeUser };
    } catch (err) {
      set.status = 400;
      return { error: "Email atau Nomor HP sudah terdaftar." };
    }
  }, {
    body: t.Object({
      full_name: t.String(),
      email: t.String({ format: 'email' }),
      password: t.String(),
      phone_number: t.String(),
      jk: t.Enum({ L: 'L', P: 'P' }),
      tanggal_lahir: t.String(),
      photo_url: t.Optional(t.String())
    })
  })

  // --- LOGIN ---
  .post("/login", async ({ body, set }) => {
    const { identifier, password } = body;
    
    // Cari berdasarkan Email ATAU Nomor HP
    const user = await db.select().from(users)
      .where(or(eq(users.email, identifier), eq(users.phoneNumber, identifier)))
      .get();

    if (!user || !(await Bun.password.verify(password, user.password))) {
      set.status = 401;
      return { error: "Kredensial salah!" };
    }

    const { password: _, ...safeUser } = user;
    return { message: "Login Berhasil!", user: safeUser };
  }, {
    body: t.Object({ 
      identifier: t.String(), // Bisa email / phone
      password: t.String() 
    })
  })

  // --- UPDATE PROFILE ---
  .patch("/update/:id", async ({ params: { id }, body, set }) => {
    try {
      const { password, ...rest } = body;
      const dataUpdate: any = { ...rest, updatedAt: sql`CURRENT_TIMESTAMP` };

      if (password) {
        dataUpdate.password = await Bun.password.hash(password);
      }

      const result = await db.update(users)
        .set(dataUpdate)
        .where(eq(users.userId, parseInt(id)))
        .returning();

      if (result.length === 0) {
        set.status = 404;
        return { error: "User tidak ditemukan" };
      }

      const { password: _, ...safeUser } = result[0];
      return { message: "Data user diperbarui", data: safeUser };
    } catch (err) {
      set.status = 500;
      return { error: "Gagal update user" };
    }
  }, {
    body: t.Partial(t.Object({
      fullName: t.String(),
      email: t.String({ format: 'email' }),
      password: t.String(),
      phoneNumber: t.String(),
      jk: t.Enum({ L: 'L', P: 'P' }),
      tanggalLahir: t.String(),
      photoUrl: t.String()
    }))
  })

  // --- DELETE AKUN ---
  .delete("/delete/:id", async ({ params: { id }, set }) => {
    const result = await db.delete(users)
      .where(eq(users.userId, parseInt(id)))
      .returning();
      
    if (result.length === 0) {
      set.status = 404;
      return { error: "User tidak ditemukan" };
    }
    return { message: "User berhasil dihapus" };
  });