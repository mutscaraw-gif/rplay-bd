import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, bookingDetails, schedules, users, seats } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export const orderRoutes = new Elysia({ prefix: '/order' })
  
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
          columns: { seatId: true, seatNumber: true, rowName: true, posX: true, posY: true }
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
        ...seat,
        is_reserved: reservedIds.has(seat.seatId)
      }));
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal memuat denah kursi" };
    }
  }, {
    params: t.Object({ scheduleId: t.Numeric() })
  })

  .post("/checkout", async ({ body, set }) => {
    const { user_id, schedule_id, seat_ids } = body;
    const MAX_SEATS = 8; 

    if (seat_ids.length === 0) return (set.status = 400, { error: "Minimal pilih 1 kursi." });
    if (seat_ids.length > MAX_SEATS) return (set.status = 400, { error: `Maksimal ${MAX_SEATS} kursi.` });

    try {
      // 1. Validasi awal User dan Jadwal
      const [scheduleData, userExists] = await Promise.all([
        db.query.schedules.findFirst({
          where: eq(schedules.scheduleId, schedule_id),
          columns: { price: true, availableSeats: true, studioId: true }
        }),
        db.query.users.findFirst({ 
          where: eq(users.userId, user_id),
          columns: { email: true }
        })
      ]);

      if (!userExists || !scheduleData) {
        set.status = 404;
        return { error: "User atau Jadwal tidak ditemukan." };
      }

      // 2. Validasi apakah kursi yang dipilih memang ada di studio tersebut
      const validSeats = await db.query.seats.findMany({
        where: and(
            eq(seats.studioId, scheduleData.studioId),
            inArray(seats.seatId, seat_ids)
        )
      });

      if (validSeats.length !== seat_ids.length) {
        set.status = 400;
        return { error: "Beberapa kursi tidak valid untuk studio ini." };
      }

      const totalHarga = (scheduleData.price || 0) * seat_ids.length;

      // 3. Memulai Transaksi
      const result = await db.transaction(async (tx) => {
        // Double Check Race Condition: Apakah kursi sudah dipesan orang lain?
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
          tx.rollback();
          return null;
        }

        // Insert ke tabel Bookings
        const [newBooking] = await tx.insert(bookings).values({
          userId: user_id,
          scheduleId: schedule_id,
          quantity: seat_ids.length,
          totalPrice: totalHarga,
          statusBooking: "PENDING",
        }).returning({ id: bookings.bookingId });

        // Insert ke tabel Booking Details
        await tx.insert(bookingDetails).values(
          seat_ids.map(seatId => ({
            bookingId: newBooking.id,
            seatId: seatId,
            statusSeat: "BOOKED" as "BOOKED" // Casting string ke enum type
          }))
        );

        // Potong Stok secara Atomic
        await tx.update(schedules)
          .set({ availableSeats: sql`available_seats - ${seat_ids.length}` })
          .where(eq(schedules.scheduleId, schedule_id));

        return newBooking.id;
      });

      if (!result) {
        set.status = 400; 
        return { error: "Kursi baru saja dipesan orang lain." };
      }

      set.status = 201;
      return { 
        message: "Checkout Berhasil", 
        booking_id: result,
        total_amount: totalHarga,
        email_user: userExists.email 
      };

    } catch (err: any) {
      set.status = 500;
      return { error: "Proses checkout gagal", details: err.message };
    }
  }, {
    body: t.Object({
      user_id: t.Number(),
      schedule_id: t.Number(),
      seat_ids: t.Array(t.Number())
    })
  })

  .get("/summary/:id", async ({ params: { id }, set }) => {
    try {
      const result = await db.query.bookings.findFirst({
        where: eq(bookings.bookingId, id),
        with: {
          user: { columns: { fullName: true, email: true } },
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
        customer: { name: result.user?.fullName, email: result.user?.email },
        movie: {
            title: result.schedule?.movie?.title,
            poster: result.schedule?.movie?.photoUrl,
            play_at: `${result.schedule?.showDate} ${result.schedule?.showTime}`
        },
        location: {
            cinema: result.schedule?.studio?.cinema?.namaBioskop,
            studio: result.schedule?.studio?.namaStudio,
            city: result.schedule?.studio?.cinema?.city?.cityName
        },
        booking_info: {
            seats: result.details?.map(d => d.seat?.seatNumber).filter(Boolean),
            quantity: result.quantity,
            total_price: result.totalPrice,
            status: result.statusBooking,
            created_at: result.createdAt
        }
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal memuat ringkasan" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  })

  .patch("/cancel/:id", async ({ params: { id }, set }) => {
    try {
      return await db.transaction(async (tx) => {
        const order = await tx.query.bookings.findFirst({
          where: eq(bookings.bookingId, id)
        });

        if (!order) {
            set.status = 404;
            return { error: "Order tidak ditemukan" };
        }
        
        if (order.statusBooking !== "PENDING") {
            set.status = 400;
            return { error: "Hanya pesanan PENDING yang bisa dibatalkan." };
        }

        await tx.update(bookings)
          .set({ statusBooking: "CANCELLED" })
          .where(eq(bookings.bookingId, id));
        
        await tx.update(schedules)
          .set({ availableSeats: sql`available_seats + ${order.quantity}` })
          .where(eq(schedules.scheduleId, order.scheduleId));

        return { message: "Booking dibatalkan, stok kursi telah pulih." };
      });
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal membatalkan booking" };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  });