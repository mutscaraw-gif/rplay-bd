import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt"; 
import { db } from "../db";
import { admins, bookings } from "../db/schema";
import { eq } from "drizzle-orm";

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "RPLAY_SECRET_KEY_2026",
    })
  )
  
  .post("/register", async ({ body, set }) => {
    try {
      const hashedPassword = await Bun.password.hash(body.password);
      const result = await db.insert(admins).values({
        fullName: body.full_name,
        email: body.email,
        password: hashedPassword,
        photoUrl: body.photo_url
      }).returning();
      
      return { message: "Admin berhasil dibuat", data: result[0] };
    } catch (err) {
      set.status = 400;
      return { error: "Email sudah terdaftar atau terjadi kesalahan!" };
    }
  }, {
    body: t.Object({
      full_name: t.String(),
      email: t.String({ format: 'email' }),
      password: t.String(),
      photo_url: t.Optional(t.String())
    })
  })

  .post("/login", async ({ body, set, jwt }) => { 
    const { email, password } = body;
    
    const admin = await db.select().from(admins).where(eq(admins.email, email)).get();

    if (!admin || !(await Bun.password.verify(password, admin.password))) {
      set.status = 401;
      return { error: "Kredensial Admin salah!" };
    }

    // Generate Token
    const token = await jwt.sign({
      id: admin.adminId,
      role: 'admin'
    });

    const { password: _, ...safeAdmin } = admin;

    return { 
      message: "Berhasil login Admin!", 
      token: token, 
      data: safeAdmin 
    };
  }, {
    body: t.Object({ email: t.String(), password: t.String() })
  })

  .get("/list", async () => await db.select().from(admins))

  // --- 2. FITUR SCAN TIKET ---
  .post("/scan-ticket", async ({ body, set }) => {
    try {
      const bookingId = parseInt(body.qr_content.replace("TIC-", ""));

      if (isNaN(bookingId)) {
        set.status = 400;
        return { status: "REJECTED", message: "Format QR Code tidak valid!" };
      }

      const ticket = await db.query.bookings.findFirst({
        where: eq(bookings.bookingId, bookingId),
        with: {
          schedule: { with: { movie: true } },
          details: { with: { seat: true } }
        }
      }) as any;

      if (!ticket) {
        set.status = 404;
        return { status: "REJECTED", message: "Tiket tidak terdaftar!" };
      }

      if (ticket.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { status: "REJECTED", message: "Pembayaran belum lunas!" };
      }

      if (ticket.isUsed) {
        set.status = 400;
        return { status: "REJECTED", message: "Tiket sudah pernah digunakan!" };
      }

      await db.update(bookings)
        .set({ isUsed: true })
        .where(eq(bookings.bookingId, bookingId));

      return {
        status: "APPROVED",
        message: "Verifikasi Berhasil!",
        data: {
          movie: ticket.schedule.movie.title,
          seats: ticket.details.map((d: any) => d.seat.seatNumber),
          studio: ticket.schedule.studioId
        }
      };

    } catch (err) {
      set.status = 500;
      return { error: "Terjadi kegagalan server" };
    }
  }, {
    body: t.Object({
      qr_content: t.String()
    })
  });