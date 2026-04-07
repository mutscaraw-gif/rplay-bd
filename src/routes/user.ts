import { Elysia, t } from "elysia";
import { jwt } from '@elysiajs/jwt'; // Import plugin JWT
import { db } from "../db";
import { users } from "../db/schema";
import { eq, or, sql } from "drizzle-orm";

export const userRoutes = new Elysia({ prefix: '/akun' })
    // Konfigurasi JWT
    .use(
        jwt({
            name: 'jwt',
            secret: 'RAHASIA_SANGAT_AMAN_123', // Ganti dengan secret key yang kuat
            exp: '7d' // Token berlaku selama 7 hari
        })
    )
    
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
            return { success: true, message: "Registrasi Berhasil!", user: safeUser };
        } catch (err) {
            set.status = 400;
            return { success: false, error: "Email atau Nomor HP sudah terdaftar." };
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

    // --- LOGIN (Sudah diperbaiki dengan JWT) ---
    .post("/login", async ({ body, set, jwt }) => {
        const { identifier, password } = body;
        
        const user = await db.select().from(users)
            .where(or(eq(users.email, identifier), eq(users.phoneNumber, identifier)))
            .get();

        // Validasi User dan Password
        if (!user || !(await Bun.password.verify(password, user.password))) {
            set.status = 401;
            return { success: false, error: "Kredensial salah!" };
        }

        // Buat Token JWT
        const token = await jwt.sign({
            userId: user.userId,
            email: user.email
        });

        const { password: _, ...safeUser } = user;

        // Kirimkan token di dalam objek user agar tersimpan di localStorage frontend
        return { 
            success: true, 
            message: "Login Berhasil!", 
            user: { 
                ...safeUser, 
                token: token // Token disisipkan di sini
            } 
        };
    }, {
        body: t.Object({ 
            identifier: t.String(),
            password: t.String() 
        })
    })

    // --- GET ALL USERS ---
    .get("/all", async ({ set }) => {
        try {
            const allUsers = await db.select().from(users);
            const safeUsers = allUsers.map(({ password, ...rest }) => rest);
            return { success: true, count: safeUsers.length, data: safeUsers };
        } catch (err) {
            set.status = 500;
            return { success: false, error: "Gagal mengambil daftar user" };
        }
    })

    // --- GET PROFILE BY ID ---
    .get("/profile/:id", async ({ params: { id }, set }) => {
        try {
            const user = await db.select().from(users)
                .where(eq(users.userId, parseInt(id)))
                .get();

            if (!user) {
                set.status = 404;
                return { success: false, error: "User tidak ditemukan" };
            }

            const { password: _, ...safeUser } = user;
            return { success: true, data: safeUser };
        } catch (err) {
            set.status = 500;
            return { success: false, error: "Internal Server Error" };
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // --- UPDATE PROFILE ---
    .patch("/update/:id", async ({ params: { id }, body, set }) => {
        try {
            const { password, ...rest } = body;
            const dataUpdate: any = { 
                ...rest, 
                updatedAt: sql`(datetime('now', 'localtime'))` 
            };

            if (password) {
                dataUpdate.password = await Bun.password.hash(password);
            }

            const result = await db.update(users)
                .set(dataUpdate)
                .where(eq(users.userId, parseInt(id)))
                .returning();

            if (result.length === 0) {
                set.status = 404;
                return { success: false, error: "User tidak ditemukan" };
            }

            const { password: _, ...safeUser } = result[0];
            return { success: true, message: "Data user diperbarui", data: safeUser };
        } catch (err) {
            set.status = 500;
            return { success: false, error: "Gagal update user" };
        }
    }, {
        params: t.Object({ id: t.String() }),
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
        try {
            const result = await db.delete(users)
                .where(eq(users.userId, parseInt(id)))
                .returning();
            
            if (result.length === 0) {
                set.status = 404;
                return { success: false, error: "User tidak ditemukan" };
            }
            return { success: true, message: "User berhasil dihapus" };
        } catch (err) {
            set.status = 500;
            return { success: false, error: "Gagal menghapus user" };
        }
    }, {
        params: t.Object({ id: t.String() })
    });