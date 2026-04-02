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
    })
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
    body: t.Object({ email: t.String(), password: t.String() })
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
    // Menghilangkan password dari list demi keamanan
    return allAdmins.map(({ password, ...rest }) => rest);
  })

  /**
   * 4. SCAN TIKET (Protected & Final Logic)
   */
  .post("/scan-ticket", async ({ body, set, jwt, headers }) => {
    try {
      // Validasi Token Admin
      const token = headers.authorization?.startsWith('Bearer ') 
        ? headers.authorization.slice(7) 
        : null;

      if (!token || !(await jwt.verify(token))) {
        set.status = 401;
        return { status: "REJECTED", message: "Akses ditolak! Token tidak valid." };
      }

      const qrContent = body.qr_content; 

      // 1. Cari record payment
      const paymentRecord = await db.query.payments.findFirst({
        where: eq(payments.externalId, qrContent),
      });

      if (!paymentRecord) {
        set.status = 404;
        return { status: "REJECTED", message: "Tiket/Invoice tidak ditemukan!" };
      }

      // 2. Ambil data booking lengkap
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
        return { status: "REJECTED", message: "Data booking tidak ditemukan!" };
      }

      // 3. Validasi Status SUCCESS
      if (ticket.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { status: "REJECTED", message: "Tiket ini belum lunas!" };
      }

      // 4. Validasi Double Scan
      if (ticket.isUsed) {
        set.status = 400;
        return { 
          status: "REJECTED", 
          message: "Tiket sudah pernah digunakan!",
          used_at: ticket.updatedAt 
        };
      }

      // 5. Update status dan waktu scan
      await db.update(bookings)
        .set({ 
          isUsed: true,
          updatedAt: sql`(datetime('now', 'localtime'))` 
        })
        .where(eq(bookings.bookingId, ticket.bookingId));

      return {
        status: "APPROVED",
        message: "Verifikasi Berhasil! Selamat menonton.",
        data: {
          movie: ticket.schedule?.movie?.title,
          cinema: (ticket.schedule?.studio as any)?.cinema?.namaBioskop || "Bioskop RPlay",
          studio: (ticket.schedule?.studio as any)?.namaStudio,
          seats: ticket.details.map((d: any) => d.seat?.seatNumber).filter(Boolean),
          booking_id: ticket.bookingId,
          scanned_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        }
      };

    } catch (err: any) {
      console.error("Scan Error:", err.message);
      set.status = 500;
      return { status: "ERROR", error: "Terjadi gangguan pada server verifikasi" };
    }
  }, {
    body: t.Object({
      qr_content: t.String()
    })
  });