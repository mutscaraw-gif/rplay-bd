import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, bookingDetails, schedules, users, seats } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

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

      const [allSeats, reservedSeats] = await Promise.all([
        db.query.seats.findMany({
          where: eq(seats.studioId, schedule.studioId),
          columns: { seatId: true, seatNumber: true, rowName: true }
        }),
        db.select({ seatId: bookingDetails.seatId })
          .from(bookingDetails)
          .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
          .where(and(
            eq(bookings.scheduleId, scheduleId),
            sql`${bookings.statusBooking} != 'CANCELLED'`
          ))
      ]);

      const reservedIds = new Set(reservedSeats.map(s => s.seatId));

      return allSeats.map(seat => ({
        seat_id: seat.seatId,
        seat_number: seat.seatNumber,
        row_name: seat.rowName,
        is_reserved: reservedIds.has(seat.seatId)
      }));
    } catch (err: any) {
      console.error("Seats Status Error:", err);
      set.status = 500;
      return { error: "Gagal memuat denah kursi", detail: err.message };
    }
  }, {
    params: t.Object({ scheduleId: t.Numeric() })
  })

  /**
   * 2. CHECKOUT (VULNERABLE TRANSACTION FIXED)
   */
  .post("/checkout", async ({ body, set }) => {
    const { user_id, schedule_id, seat_ids } = body;
    const MAX_SEATS = 8; 

    // Validasi input awal
    if (!seat_ids || seat_ids.length === 0) {
      set.status = 400;
      return { error: "Minimal pilih 1 kursi." };
    }
    if (seat_ids.length > MAX_SEATS) {
      set.status = 400;
      return { error: `Maksimal pembelian adalah ${MAX_SEATS} kursi.` };
    }

    try {
      // Validasi User & Schedule sebelum masuk transaksi
      const [scheduleData, userExists] = await Promise.all([
        db.query.schedules.findFirst({
          where: eq(schedules.scheduleId, schedule_id),
          columns: { price: true, availableSeats: true }
        }),
        db.query.users.findFirst({ 
          where: eq(users.userId, user_id),
          columns: { fullName: true }
        })
      ]);

      if (!userExists) {
        set.status = 404;
        return { error: `User dengan ID ${user_id} tidak ditemukan di database.` };
      }
      if (!scheduleData) {
        set.status = 404;
        return { error: "Jadwal tidak ditemukan." };
      }

      const currentAvailable = scheduleData.availableSeats ?? 0;
      if (seat_ids.length > currentAvailable) {
        set.status = 400;
        return { error: "Kursi tersedia tidak mencukupi kuota pilihan Anda." };
      }

      const totalHarga = (Number(scheduleData.price) || 0) * seat_ids.length;

      // START TRANSACTION
      const result = await db.transaction(async (tx) => {
        // 1. Cek double-booking (Race Condition Protection)
        const isOccupied = await tx
          .select({ id: bookingDetails.seatId })
          .from(bookingDetails)
          .innerJoin(bookings, eq(bookingDetails.bookingId, bookings.bookingId))
          .where(and(
            eq(bookings.scheduleId, schedule_id),
            inArray(bookingDetails.seatId, seat_ids),
            sql`${bookings.statusBooking} != 'CANCELLED'`
          ));

        if (isOccupied.length > 0) {
          // Jangan gunakan tx.rollback() manual yang melempar exception liar
          // Gunakan throw untuk memicu rollback yang ditangkap catch utama
          throw new Error("OCCUPIED");
        }

        // 2. Insert Booking
        const [newBooking] = await tx.insert(bookings).values({
          userId: user_id,
          scheduleId: schedule_id,
          quantity: seat_ids.length,
          totalPrice: totalHarga,
          statusBooking: "PENDING",
        }).returning({ id: bookings.bookingId });

        // 3. Insert Details
        const detailsData = seat_ids.map(seatId => ({
          bookingId: newBooking.id,
          seatId: seatId,
          statusSeat: "BOOKED" as const
        }));
        
        await tx.insert(bookingDetails).values(detailsData);

        // 4. Update Stok Kursi
        await tx.update(schedules)
          .set({ availableSeats: sql`${schedules.availableSeats} - ${seat_ids.length}` })
          .where(eq(schedules.scheduleId, schedule_id));

        return newBooking.id;
      });
//update ni
      set.status = 201;
      return { 
        message: "Checkout Berhasil", 
        booking_id: result,
        quantity: seat_ids.length,
        total_amount: totalHarga
      };

    } catch (err: any) {
      console.error("--- BACKEND CHECKOUT ERROR ---");
      console.error("Message:", err.message);
      
      if (err.message === "OCCUPIED") {
        set.status = 400;
        return { error: "Maaf, satu atau lebih kursi baru saja dipesan orang lain." };
      }

      // Menangkap error Foreign Key atau Database
      set.status = 500;
      return { 
        error: "Proses checkout gagal di server.", 
        detail: err.message 
      };
    }
  }, {
    body: t.Object({
      user_id: t.Number(),
      schedule_id: t.Number(),
      seat_ids: t.Array(t.Number())
    })
  })

  /**
   * 3. GET ORDER SUMMARY
   */
  .get("/summary/:id", async ({ params: { id }, set }) => {
    try {
      const result = await db.query.bookings.findFirst({
        where: eq(bookings.bookingId, id),
        with: {
          user: { columns: { fullName: true } },
          schedule: {
            with: {
              movie: { columns: { title: true, photoUrl: true } },
              studio: { with: { cinema: { with: { city: true } } } }
            }
          },
          details: { with: { seat: true } }
        }
      });

      if (!result) {
        set.status = 404;
        return { error: "Pesanan tidak ditemukan" };
      }

      return {
        order_id: result.bookingId,
        customer: result.user?.fullName,
        movie_title: result.schedule?.movie?.title,
        poster: result.schedule?.movie?.photoUrl,
        location: `${result.schedule?.studio?.cinema?.namaBioskop} - ${result.schedule?.studio?.namaStudio}`,
        city: result.schedule?.studio?.cinema?.city?.cityName,
        play_at: `${result.schedule?.showDate} ${result.schedule?.showTime}`,
        seats: result.details?.map(d => d.seat?.seatNumber).filter(Boolean),
        quantity: result.quantity,
        total_price: result.totalPrice,
        status: result.statusBooking,
        created_at: result.createdAt
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal memuat ringkasan" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  })

  /**
   * 4. CANCEL BOOKING
   */
  .patch("/cancel/:id", async ({ params: { id }, set }) => {
    try {
      return await db.transaction(async (tx) => {
        const order = await tx.query.bookings.findFirst({
          where: eq(bookings.bookingId, id)
        });

        if (!order || order.statusBooking !== "PENDING") {
          throw new Error("NOT_FOUND_OR_PAID");
        }

        await tx.update(bookings)
          .set({ statusBooking: "CANCELLED" })
          .where(eq(bookings.bookingId, id));
        
        await tx.update(schedules)
          .set({ availableSeats: sql`${schedules.availableSeats} + ${order.quantity}` })
          .where(eq(schedules.scheduleId, order.scheduleId));

        return { message: "Booking berhasil dibatalkan." };
      });
    } catch (err: any) {
      if (err.message === "NOT_FOUND_OR_PAID") {
        set.status = 400;
        return { error: "Pesanan tidak ditemukan atau tidak bisa dibatalkan." };
      }
      set.status = 500;
      return { error: "Gagal membatalkan booking" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  });