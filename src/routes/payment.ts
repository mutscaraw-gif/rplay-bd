import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, payments, schedules } from "../db/schema";
import { eq, sql, and } from "drizzle-orm";
import { Xendit } from "xendit-node";

const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY!,
});

export const paymentRoutes = new Elysia({ prefix: "/payment" })
  /**
   * 1. CREATE INVOICE
   * Membuat tagihan ke Xendit dan menyimpan data transaksi awal
   */
  .post(
    "/create-invoice",
    async ({ body, set }) => {
      try {
        const externalId = `INV-RPLAY-${body.bookingId}-${Date.now()}`;
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        const xenditInvoice = await xenditClient.Invoice.createInvoice({
          data: {
            externalId: externalId,
            amount: body.amount,
            payerEmail: body.email,
            description: `Tiket Cinema RPlay - Booking #${body.bookingId}`,
            // Diarahkan langsung ke halaman tiket setelah sukses
            successRedirectUrl: `${frontendUrl}/ticket/${body.bookingId}`,
            failureRedirectUrl: `${frontendUrl}/order/summary/${body.bookingId}`,
            invoiceDuration: 900,
          },
        });

        await db.insert(payments).values({
          bookingId: body.bookingId,
          amount: body.amount,
          externalId: externalId,
          checkoutUrl: xenditInvoice.invoiceUrl,
          paymentMethod: "XENDIT_GATEWAY",
          paymentStatus: "PENDING",
        });

        return {
          success: true,
          message: "Invoice berhasil dibuat",
          checkout_url: xenditInvoice.invoiceUrl,
          external_id: externalId,
        };
      } catch (err: any) {
        set.status = 500;
        return {
          success: false,
          error: "Gagal membuat invoice",
          detail: err.message,
        };
      }
    },
    {
      body: t.Object({
        bookingId: t.Number(),
        amount: t.Number(),
        email: t.String(),
      }),
    },
  )

  /**
   * 2. CALLBACK (WEBHOOK)
   * Menangani notifikasi otomatis dari Xendit saat pembayaran lunas/expired
   */
  .post(
    "/callback",
    async ({ body, headers, set }) => {
      try {
        // Verifikasi Token Webhook untuk keamanan
        const callbackToken = headers["x-callback-token"];
        if (
          !callbackToken ||
          callbackToken !== process.env.XENDIT_CALLBACK_TOKEN
        ) {
          set.status = 403;
          return { error: "Invalid Callback Token" };
        }

        const payload = body as any;

        return await db.transaction(async (tx) => {
          const payRecord = await tx.query.payments.findFirst({
            where: eq(payments.externalId, payload.external_id),
          });

          if (!payRecord)
            return { status: "error", message: "Transaksi tidak ditemukan" };

          // LOGIKA JIKA PEMBAYARAN BERHASIL
          if (payload.status === "PAID" || payload.status === "SETTLED") {
            if (payRecord.paymentStatus === "PAID")
              return { status: "already_processed" };

            await tx
              .update(payments)
              .set({
                paymentStatus: "PAID",
                paymentMethod: payload.payment_method || "UNKNOWN",
                updatedAt: sql`(datetime('now', 'localtime'))`,
              })
              .where(eq(payments.externalId, payload.external_id));

            await tx
              .update(bookings)
              .set({ statusBooking: "SUCCESS" })
              .where(eq(bookings.bookingId, payRecord.bookingId));

            return { status: "success", action: "updated_to_paid" };
          }

          // LOGIKA JIKA PEMBAYARAN EXPIRED
          if (payload.status === "EXPIRED") {
            if (payRecord.paymentStatus !== "PENDING")
              return { status: "ignored" };

            await tx
              .update(payments)
              .set({
                paymentStatus: "EXPIRED",
                updatedAt: sql`(datetime('now', 'localtime'))`,
              })
              .where(eq(payments.externalId, payload.external_id));

            const bookingData = await tx.query.bookings.findFirst({
              where: eq(bookings.bookingId, payRecord.bookingId),
            });

            if (bookingData && bookingData.statusBooking === "PENDING") {
              await tx
                .update(bookings)
                .set({ statusBooking: "CANCELLED" })
                .where(eq(bookings.bookingId, payRecord.bookingId));

              // Kembalikan stok kursi karena tidak jadi dibayar
              await tx
                .update(schedules)
                .set({
                  availableSeats: sql`available_seats + ${bookingData.quantity}`,
                })
                .where(eq(schedules.scheduleId, bookingData.scheduleId));
            }
            return {
              status: "success",
              action: "cancelled_and_restored_stock",
            };
          }
        });
      } catch (err: any) {
        set.status = 500;
        return { error: "Webhook Error", message: err.message };
      }
    },
    { body: t.Any() },
  )

  /**
   * 3. GET PAYMENT SUMMARY
   * Digunakan oleh Frontend sebelum user klik "Bayar Sekarang"
   */
  .get(
    "/summary/:bookingId",
    async ({ params: { bookingId }, query, set }) => {
      try {
        const bId = parseInt(bookingId);
        const uId = query.userId ? parseInt(query.userId) : null;

        if (!uId) {
          set.status = 400;
          return { error: "User ID diperlukan (?userId=...)" };
        }

        const result = await db.query.bookings.findFirst({
          where: and(eq(bookings.bookingId, bId), eq(bookings.userId, uId)),
          with: {
            schedule: {
              with: {
                movie: true,
                studio: { with: { cinema: true } },
              },
            },
            details: { with: { seat: true } },
            payments: {
              orderBy: (payments, { desc }) => [desc(payments.createdAt)],
              limit: 1,
            },
          },
        });

        if (!result) {
          set.status = 404;
          return { error: "Data booking tidak ditemukan" };
        }

        const adminFee = 2000;

        return {
          success: true,
          data: {
            booking_id: result.bookingId,
            movie: {
              title: result.schedule?.movie?.title,
              poster: result.schedule?.movie?.photoUrl,
              studio: result.schedule?.studio?.namaStudio,
              cinema: result.schedule?.studio?.cinema?.namaBioskop,
            },
            order_details: {
              seats: result.details
                ?.map((d) => d.seat?.seatNumber)
                .filter(Boolean),
              quantity: result.quantity,
              subtotal: result.totalPrice,
              total_price: result.totalPrice + adminFee,
            },
            payment: {
              status: result.payments[0]?.paymentStatus || "NOT_CREATED",
              checkout_url: result.payments[0]?.checkoutUrl,
              expiry_label: "15 Menit",
            },
          },
        };
      } catch (err: any) {
        set.status = 500;
        return { error: "Gagal memuat ringkasan pembayaran" };
      }
    },
    {
      params: t.Object({ bookingId: t.String() }),
      query: t.Object({ userId: t.Optional(t.String()) }),
    },
  )

  /**
   * 4. GET STATUS
   * Polling status untuk cek apakah user sudah bayar atau belum
   */
  .get(
    "/status/:bookingId",
    async ({ params: { bookingId }, set }) => {
      try {
        const bId = parseInt(bookingId);
        const payment = await db.query.payments.findFirst({
          where: eq(payments.bookingId, bId),
          orderBy: (payments, { desc }) => [desc(payments.createdAt)],
        });

        if (!payment) {
          set.status = 404;
          return { error: "Data pembayaran tidak ditemukan" };
        }

        return {
          success: true,
          status: payment.paymentStatus,
          external_id: payment.externalId,
        };
      } catch (err: any) {
        set.status = 500;
        return { error: "Gagal mengecek status" };
      }
    },
    {
      params: t.Object({ bookingId: t.String() }),
    },
  )

  .get("/list/:userId", async ({ params: { userId }, set }) => {
    try {
      const uId = parseInt(userId);

      const results = await db.query.bookings.findMany({
        where: eq(bookings.userId, uId),
        orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
        with: {
          schedule: {
            with: {
              movie: true,
              studio: { with: { cinema: true } },
            },
          },
          details: {
            with: {
              seat: true, // Mengambil data kursi (rowName & seatNumber)
            },
          },
          payments: {
            orderBy: (payments, { desc }) => [desc(payments.createdAt)],
            limit: 1,
          },
        },
      });

      const adminFee = 2000;

      const mappedData = results.map((result) => ({
        order_id: result.bookingId,
        status: result.statusBooking,
        movie_title: result.schedule?.movie?.title,
        poster: result.schedule?.movie?.photoUrl,
        location: `${result.schedule?.studio?.cinema?.namaBioskop} - ${result.schedule?.studio?.namaStudio}`,
        play_at: `${result.schedule?.showDate} ${result.schedule?.showTime}`,
        // PERBAIKAN: Menggabungkan Baris dan Nomor (A1, A2, dst)
        seats: result.details
          ?.map((d) => `${d.seat?.rowName}${d.seat?.seatNumber}`)
          .filter(Boolean),
        total_price: result.totalPrice + adminFee,
        payment_status: result.payments[0]?.paymentStatus || "NOT_CREATED",
        checkout_url: result.payments[0]?.checkoutUrl,
        // Tambahkan data tambahan untuk TicketModal jika diperlukan
        invoice_id: result.payments[0]?.externalId || `INV-${result.bookingId}`,
      }));

      return {
        success: true,
        data: mappedData,
      };
    } catch (err: any) {
      console.error("History Error:", err.message);
      set.status = 500;
      return { success: false, error: "Gagal memuat riwayat pesanan" };
    }
  });