import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt"; 
import { db } from "../db";
import { admins, bookings, payments } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "RPLAY_SECRET_KEY_2026",
    })
  )
  
  /**
   * 1. REGISTER ADMIN
   */
  .post("/register", async ({ body, set }) => {
    try {
      const hashedPassword = await Bun.password.hash(body.password);
      const [newAdmin] = await db.insert(admins).values({
        fullName: body.full_name,
        email: body.email,
        password: hashedPassword,
        photoUrl: body.photo_url
      }).returning();
      
      const { password: _, ...adminData } = newAdmin;
      return { success: true, message: "Admin berhasil dibuat", data: adminData };
    } catch (err) {
      set.status = 400;
      return { success: false, error: "Email sudah terdaftar atau terjadi kesalahan!" };
    }
  }, {
    body: t.Object({
      full_name: t.String(),
      email: t.String({ format: 'email' }),
      password: t.String(),
      photo_url: t.Optional(t.String())
    }),
    detail: { tags: ['Admin Auth'], summary: 'Daftar akun admin baru' }
  })

  /**
   * 2. LOGIN ADMIN
   */
  .post("/login", async ({ body, set, jwt }) => { 
    const { email, password } = body;
    
    const admin = await db.query.admins.findFirst({
        where: eq(admins.email, email)
    });

    if (!admin || !(await Bun.password.verify(password, admin.password))) {
      set.status = 401;
      return { success: false, error: "Kredensial Admin salah!" };
    }

    const token = await jwt.sign({
      id: admin.adminId,
      role: 'admin'
    });

    const { password: _, ...safeAdmin } = admin;

    return { 
      success: true,
      message: "Berhasil login Admin!", 
      token: token, 
      data: safeAdmin 
    };
  }, {
    body: t.Object({ email: t.String(), password: t.String() }),
    detail: { tags: ['Admin Auth'], summary: 'Login untuk mendapatkan token' }
  })

  /**
   * 3. LIST ADMIN (Protected)
   */
  .get("/list", async ({ jwt, headers, set }) => {
    const token = headers.authorization?.startsWith('Bearer ') 
      ? headers.authorization.slice(7) 
      : null;

    if (!token || !(await jwt.verify(token))) {
        set.status = 401;
        return { success: false, error: "Unauthorized" };
    }
    
    const allAdmins = await db.select().from(admins);
    return allAdmins.map(({ password, ...rest }) => rest);
  }, {
    detail: { 
      tags: ['Admin Management'], 
      summary: 'Ambil semua data admin',
      security: [{ bearerAuth: [] }] 
    }
  })

  /**
   * 4. SCAN TIKET (Protected & Final Logic)
   */
.post("/scan-ticket", async ({ body, set }) => {
    try {
      const { qr_content, admin_email, admin_password } = body;

      // 1. VERIFIKASI ADMIN (Langsung via DB & Bun.password)
      const admin = await db.query.admins.findFirst({
        where: eq(admins.email, admin_email)
      });

      // Cek apakah admin ada dan password (Argon2) cocok
      if (!admin || !(await Bun.password.verify(admin_password, admin.password))) {
        set.status = 401;
        return { 
          status: "REJECTED", 
          message: "Akses ditolak! Email atau Password Admin salah." 
        };
      }

      // 2. CARI DATA PEMBAYARAN BERDASARKAN QR (EXTERNAL ID)
      const paymentRecord = await db.query.payments.findFirst({
        where: eq(payments.externalId, qr_content),
      });

      if (!paymentRecord) {
        set.status = 404;
        return { 
          status: "REJECTED", 
          message: "Tiket tidak valid! Invoice ID tidak ditemukan di sistem." 
        };
      }

      // 3. AMBIL DETAIL BOOKING LENGKAP
      const ticket = await db.query.bookings.findFirst({
        where: eq(bookings.bookingId, paymentRecord.bookingId),
        with: {
          schedule: { 
            with: { 
              movie: true,
              studio: { with: { cinema: true } } 
            } 
          },
          details: { with: { seat: true } }
        }
      });

      if (!ticket) {
        set.status = 404;
        return { status: "REJECTED", message: "Data booking hilang dari database." };
      }

      // 4. VALIDASI STATUS PEMBAYARAN & PENGGUNAAN
      if (ticket.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { 
          status: "REJECTED", 
          message: "Tiket gagal diverifikasi! Pembayaran belum lunas atau dibatalkan." 
        };
      }

      if (ticket.isUsed) {
        set.status = 400;
        return { 
          status: "REJECTED", 
          message: "Tiket sudah hangus! Sudah pernah di-scan sebelumnya.",
          scanned_at: ticket.updatedAt 
        };
      }

      // 5. UPDATE TIKET MENJADI 'USED'
      const now = new Date();
      await db.update(bookings)
        .set({ 
          isUsed: true,
          updatedAt: sql`(datetime('now', 'localtime'))` 
        })
        .where(eq(bookings.bookingId, ticket.bookingId));

      // 6. RESPONSE BERHASIL (APPROVED)
      return {
        status: "APPROVED",
        message: "Check-in Berhasil! Silakan masuk ke studio.",
        info: {
          movie: ticket.schedule?.movie?.title,
          cinema: (ticket.schedule?.studio as any)?.cinema?.namaBioskop,
          studio: (ticket.schedule?.studio as any)?.namaStudio,
          seats: ticket.details.map((d: any) => d.seat?.seatNumber).filter(Boolean),
          scanned_by: admin.fullName,
          time: now.toLocaleTimeString('id-ID')
        }
      };

    } catch (err: any) {
      console.error("Scan Error:", err.message);
      set.status = 500;
      return { status: "ERROR", message: "Gagal memproses verifikasi.", detail: err.message };
    }
  }, {
    body: t.Object({
      qr_content: t.String({ description: "Isi QR Code (INV-RPLAY-XXX)" }),
      admin_email: t.String({ format: 'email', description: "Email Admin untuk verifikasi" }),
      admin_password: t.String({ description: "Password Admin untuk verifikasi" })
    }),
    detail: {
      tags: ['Admin Ticket System'],
      summary: 'Verifikasi & Scan Tiket Penonton (Tanpa Bearer Token)'
    }
  });