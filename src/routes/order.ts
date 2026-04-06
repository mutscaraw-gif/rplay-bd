import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, bookingDetails, schedules, users, seats, payments } from "../db/schema";
import { eq, and, inArray, sql, ne, desc } from "drizzle-orm";

export const orderRoutes = new Elysia({ prefix: '/order' })
  
  /**
   * 1. GET SEATS STATUS
   */
  .get("/seats-status/:scheduleId", async ({ params: { scheduleId }, set }) => {
    try {
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.scheduleId, scheduleId),
        columns: { studioId: true }
      });

      if (!schedule) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan" };
      }

      // Ambil semua kursi dan kursi yang sudah dibooking (kecuali yang dicancel)
      const [allSeats, reservedSeats] = await Promise.all([
        db.query.seats.findMany({
          where: eq(seats.studioId, schedule.studioId),
        }),
        db.select({ seatId: bookingDetails.seatId })
          .from(bookingDetails)
          .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
          .where(and(
            eq(bookings.scheduleId, scheduleId),
            ne(bookings.statusBooking, 'CANCELLED') // Lebih bersih pakai ne (not equal)
          ))
      ]);

      const reservedIds = new Set(reservedSeats.map(s => s.seatId));

      return allSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_number: seat.seatNumber,
        row_name: seat.rowName,
        // Frontend butuh is_available agar tombol bisa di-klik
        is_available: !reservedIds.has(seat.seatId),
        is_reserved: reservedIds.has(seat.seatId)
      }));
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal memuat denah kursi" };
    }
  }, {
    params: t.Object({ scheduleId: t.Numeric() })
  })

  /**
   * 2. CHECKOUT (OPTIMIZED TRANSACTION)
   */
  .post("/checkout", async ({ body, set }) => {
    const { user_id, schedule_id, seat_ids } = body;
    const MAX_SEATS = 8; 

    if (!seat_ids || seat_ids.length === 0) {
      set.status = 400;
      return { error: "Minimal pilih 1 kursi." };
    }

    try {
      // 1. Jalankan semua pengecekan di dalam Transaksi agar data Konsisten (Atomic)
      const result = await db.transaction(async (tx) => {
        
        // Cek apakah User ada
        const user = await tx.query.users.findFirst({
          where: eq(users.userId, user_id)
        });
        if (!user) throw new Error("USER_NOT_FOUND");

        // Cek Jadwal & Harga terbaru (Lock for update jika DB mendukung)
        const scheduleData = await tx.query.schedules.findFirst({
          where: eq(schedules.scheduleId, schedule_id),
        });
        if (!scheduleData) throw new Error("SCHEDULE_NOT_FOUND");

        // 2. CEK DOUBLE BOOKING (Paling Penting)
        // Kita cek apakah ada ID kursi yang diminta sudah ada di tabel bookingDetails untuk jadwal ini
        const existingBookings = await tx
          .select()
          .from(bookingDetails)
          .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
          .where(and(
            eq(bookings.scheduleId, schedule_id),
            inArray(bookingDetails.seatId, seat_ids),
            ne(bookings.statusBooking, 'CANCELLED')
          ));

        if (existingBookings.length > 0) {
          throw new Error("ALREADY_BOOKED");
        }

        const totalHarga = (Number(scheduleData.price) || 0) * seat_ids.length;

        // 3. Eksekusi Insert Booking
        const [newBooking] = await tx.insert(bookings).values({
          userId: user_id,
          scheduleId: schedule_id,
          quantity: seat_ids.length,
          totalPrice: totalHarga,
          statusBooking: "PENDING",
        }).returning({ id: bookings.bookingId });

        // 4. Eksekusi Insert Detail Kursi
        const detailsData = seat_ids.map(sid => ({
          bookingId: newBooking.id,
          seatId: sid,
          statusSeat: "BOOKED" as const
        }));
        await tx.insert(bookingDetails).values(detailsData);

        // 5. Update Sisa Kursi di tabel Schedule
        await tx.update(schedules)
          .set({ 
            availableSeats: sql`${schedules.availableSeats} - ${seat_ids.length}` 
          })
          .where(eq(schedules.scheduleId, schedule_id));

        return {
          booking_id: newBooking.id,
          total_amount: totalHarga
        };
      });

      set.status = 201;
      return { 
        message: "Checkout Berhasil", 
        ...result,
        quantity: seat_ids.length 
      };

    } catch (err: any) {
      console.error("Internal Error:", err.message);
      
      // Mapping Error agar Frontend menerima pesan yang jelas
      if (err.message === "ALREADY_BOOKED") {
        set.status = 400;
        return { error: "Beberapa kursi yang Anda pilih baru saja dipesan orang lain. Silakan pilih kursi lain." };
      }
      if (err.message === "USER_NOT_FOUND") {
        set.status = 404;
        return { error: "User tidak valid." };
      }
      
      set.status = 500;
      return { error: "Gagal memproses checkout", detail: err.message };
    }
  }, {
    body: t.Object({
      user_id: t.Number(),
      schedule_id: t.Number(),
      seat_ids: t.Array(t.Number())
    })
  })

  /**
   * 3. GET ALL BOOKINGS (UNTUK ADMIN DASHBOARD)
   * Hanya menambahkan bagian ini sesuai permintaan.
   */
  .get("/all-bookings", async ({ set }) => {
    try {
      const data = await db.query.bookings.findMany({
        with: {
          user: { columns: { fullName: true } },
          schedule: {
            with: { movie: { columns: { title: true } } }
          },
          payments: {
            columns: { paymentMethod: true },
            orderBy: [desc(payments.createdAt)],
            limit: 1
          }
        },
        orderBy: [desc(bookings.createdAt)]
      });

      return data.map(b => ({
        booking_id: `BK-${b.bookingId}`,
        user_name: b.user?.fullName || "Guest",
        movie_title: b.schedule?.movie?.title || "Unknown Movie",
        total_price: b.totalPrice,
        status: b.statusBooking,
        payment_method: b.payments[0]?.paymentMethod || "NONE",
        created_at: b.createdAt
      }));
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal mengambil data booking", detail: err.message };
    }
  });