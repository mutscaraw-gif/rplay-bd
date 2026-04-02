import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, payments, schedules } from "../db/schema";
import { eq, sql, and } from "drizzle-orm";
import { Xendit } from 'xendit-node';

const xenditClient = new Xendit({ 
    secretKey: process.env.XENDIT_SECRET_KEY! 
});

export const paymentRoutes = new Elysia({ prefix: '/payment' })

  /**
   * 1. CREATE INVOICE
   */
  .post("/create-invoice", async ({ body, set }) => {
    try {
      const externalId = `INV-RPLAY-${body.bookingId}-${Date.now()}`;

      const xenditInvoice = await xenditClient.Invoice.createInvoice({
        data: {
          externalId: externalId,
          amount: body.amount,
          payerEmail: body.email,
          description: `Tiket Cinema RPlay - Booking #${body.bookingId}`,
          successRedirectUrl: `${process.env.FRONTEND_URL}/order/summary/${body.bookingId}`,
          failureRedirectUrl: `${process.env.FRONTEND_URL}/order/summary/${body.bookingId}`,
          invoiceDuration: 900, 
        }
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
        message: "Invoice created successfully",
        checkout_url: xenditInvoice.invoiceUrl, 
        external_id: externalId 
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal membuat invoice", detail: err.message };
    }
  }, {
    body: t.Object({ 
        bookingId: t.Number(), 
        amount: t.Number(), 
        email: t.String() 
    })
  })

  /**
   * 2. CALLBACK (WEBHOOK)
   */
  .post("/callback", async ({ body, headers, set }) => {
    try {
      const callbackToken = headers['x-callback-token'];
      if (!callbackToken || callbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      const payload = body as any;

      return await db.transaction(async (tx) => {
        const payRecord = await tx.query.payments.findFirst({
          where: eq(payments.externalId, payload.external_id)
        });

        if (!payRecord) return { status: "error" };

        if (payload.status === "PAID" || payload.status === "SETTLED") {
          if (payRecord.paymentStatus === "PAID") return { status: "already_processed" };

          await tx.update(payments)
            .set({ 
              paymentStatus: "PAID",
              paymentMethod: payload.payment_method || "UNKNOWN",
              updatedAt: sql`(datetime('now', 'localtime'))`
            })
            .where(eq(payments.externalId, payload.external_id));

          await tx.update(bookings)
            .set({ statusBooking: "SUCCESS" })
            .where(eq(bookings.bookingId, payRecord.bookingId));
          
          return { status: "success" };
        }

        if (payload.status === "EXPIRED") {
          if (payRecord.paymentStatus !== "PENDING") return { status: "already_finalized" };

          await tx.update(payments)
            .set({ paymentStatus: "EXPIRED", updatedAt: sql`(datetime('now', 'localtime'))` })
            .where(eq(payments.externalId, payload.external_id));

          const bookingData = await tx.query.bookings.findFirst({
              where: eq(bookings.bookingId, payRecord.bookingId)
          });

          if (bookingData && bookingData.statusBooking === "PENDING") {
              await tx.update(bookings).set({ statusBooking: "CANCELLED" }).where(eq(bookings.bookingId, payRecord.bookingId));
              await tx.update(schedules)
                  .set({ availableSeats: sql`available_seats + ${bookingData.quantity}` })
                  .where(eq(schedules.scheduleId, bookingData.scheduleId));
          }
          return { status: "expired_restored" };
        }
      });
    } catch (err: any) {
      set.status = 500;
      return { error: "Webhook Failed" };
    }
  }, { body: t.Any() })

  /**
   * 3. GET PAYMENT SUMMARY (Fix Error 422)
   */
  .get("/summary/:bookingId", async ({ params: { bookingId }, query, set }) => {
    try {
      // Manual Conversion untuk menghindari 422
      const bId = parseInt(bookingId);
      const uId = query.userId ? parseInt(query.userId) : null;

      if (!uId) {
        set.status = 400;
        return { error: "User ID wajib disertakan dalam query (?userId=...)" };
      }

      const result = await db.query.bookings.findFirst({
        where: and(
          eq(bookings.bookingId, bId),
          eq(bookings.userId, uId)
        ),
        with: {
          schedule: {
            with: {
              movie: true,
              studio: { with: { cinema: true } }
            }
          },
          details: { with: { seat: true } },
          payments: {
            orderBy: (payments, { desc }) => [desc(payments.createdAt)],
            limit: 1
          }
        }
      });

      if (!result) {
        set.status = 404;
        return { error: "Data booking tidak ditemukan atau bukan milik user ini" };
      }

      const adminFee = 2000;

      return {
        booking_id: result.bookingId,
        movie: {
          title: result.schedule?.movie?.title,
          poster: result.schedule?.movie?.photoUrl,
          studio: result.schedule?.studio?.namaStudio,
          cinema: result.schedule?.studio?.cinema?.namaBioskop,
        },
        order_details: {
          seats: result.details?.map(d => d.seat?.seatNumber).filter(Boolean),
          quantity: result.quantity,
          subtotal: result.totalPrice,
          total_price: result.totalPrice + adminFee,
        },
        payment: {
          status: result.payments[0]?.paymentStatus || "NOT_CREATED",
          checkout_url: result.payments[0]?.checkoutUrl,
          expiry_label: "15 Menit"
        }
      };
    } catch (err: any) {
      console.error("Summary Error:", err);
      set.status = 500;
      return { error: "Internal Server Error" };
    }
  }, {
    // Menggunakan t.String agar input URL tidak langsung ditolak jika formatnya string
    params: t.Object({ bookingId: t.String() }),
    query: t.Object({ userId: t.Optional(t.String()) })
  })

  /**
   * 4. GET STATUS (Fix Error 422)
   */
  .get("/status/:bookingId", async ({ params: { bookingId }, set }) => {
    try {
      const bId = parseInt(bookingId);
      const payment = await db.query.payments.findFirst({
        where: eq(payments.bookingId, bId),
        orderBy: (payments, { desc }) => [desc(payments.createdAt)]
      });
      
      if (!payment) {
        set.status = 404;
        return { error: "Payment Not Found" };
      }

      return { 
        status: payment.paymentStatus, 
        external_id: payment.externalId 
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Server Error" };
    }
  }, { 
    params: t.Object({ bookingId: t.String() }) 
  });