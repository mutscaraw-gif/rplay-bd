import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings, payments } from "../db/schema";
import { eq, sql } from "drizzle-orm";
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
      // Menggunakan timestamp agar ID unik
      const externalId = `INV-RPLAY-${body.bookingId}-${Date.now()}`;

      const xenditInvoice = await xenditClient.Invoice.createInvoice({
        data: {
          externalId: externalId,
          amount: body.amount,
          payerEmail: body.email,
          description: `Tiket Cinema RPlay - Booking #${body.bookingId}`,
          // Pastikan redirect URL mengarah ke frontend kamu nantinya
          successRedirectUrl: `http://localhost:3000/order/summary/${body.bookingId}`,
          failureRedirectUrl: `http://localhost:3000/order/summary/${body.bookingId}`,
          invoiceDuration: 900, // 15 menit
        }
      });

      await db.insert(payments).values({
        bookingId: body.bookingId,
        amount: body.amount,
        externalId: externalId,
        checkoutUrl: xenditInvoice.invoiceUrl,
        paymentMethod: "XENDIT_GATEWAY",
        paymentStatus: "PENDING",
        updatedAt: sql`datetime('now')` 
      });

      return { 
        message: "Invoice created successfully",
        checkout_url: xenditInvoice.invoiceUrl, 
        external_id: externalId 
      };
    } catch (err: any) {
      console.error("Xendit Error:", err);
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
   * Diperbaiki untuk menangani simulasi manual dan webhook asli Xendit
   */
  .post("/callback", async ({ body, headers, set }) => {
    try {
      const callbackToken = headers['x-callback-token'];
      
      // Keamanan: Validasi token dari Xendit
      if (!callbackToken || callbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
        set.status = 403;
        return { error: "Forbidden: Invalid Callback Token" };
      }

      const payload = body as any;

      // Logika untuk status PAID atau SETTLED
      if (payload.status === "PAID" || payload.status === "SETTLED") {
        const result = await db.transaction(async (tx) => {
          // 1. Update Tabel Payments
          const [updatedPayment] = await tx.update(payments)
            .set({ 
              paymentStatus: "PAID",
              paymentMethod: payload.payment_method || "QRIS", // Default ke QRIS jika simulasi
              updatedAt: sql`datetime('now')`
            })
            .where(eq(payments.externalId, payload.external_id))
            .returning();

          if (!updatedPayment) {
            throw new Error("Payment record not found for external_id: " + payload.external_id);
          }

          // 2. Update Tabel Bookings (Status jadi SUCCESS)
          await tx.update(bookings)
            .set({ statusBooking: "SUCCESS" })
            .where(eq(bookings.bookingId, updatedPayment.bookingId));
          
          return { status: "success", bookingId: updatedPayment.bookingId };
        });

        return result;
      }

      // Logika untuk status EXPIRED
      if (payload.status === "EXPIRED") {
        await db.update(payments)
          .set({ 
            paymentStatus: "EXPIRED",
            updatedAt: sql`datetime('now')` 
          })
          .where(eq(payments.externalId, payload.external_id));
        
        return { status: "expired_recorded" };
      }

      return { status: "ignored", message: "Status not handled" };
    } catch (err: any) {
      // PENTING: Lihat console terminal untuk tahu kenapa error
      console.error("WEBHOOK ERROR LOG:", err.message);
      set.status = 400;
      return { error: "Webhook Processing Failed", detail: err.message };
    }
  }, { body: t.Any() })

  /**
   * 3. GET STATUS
   */
  .get("/status/:bookingId", async ({ params: { bookingId }, set }) => {
    try {
      const payment = await db.query.payments.findFirst({
        where: eq(payments.bookingId, bookingId),
      });

      if (!payment) {
        set.status = 404;
        return { error: "Payment not found for this booking" };
      }

      return {
        booking_id: payment.bookingId,
        status: payment.paymentStatus,
        payment_method: payment.paymentMethod,
        external_id: payment.externalId,
        updated_at: payment.updatedAt
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Internal Server Error" };
    }
  }, { params: t.Object({ bookingId: t.Numeric() }) });