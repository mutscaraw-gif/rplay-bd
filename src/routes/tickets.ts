import { Elysia, t } from "elysia";
import { jwt } from '@elysiajs/jwt'; // 1. Tambahkan Import JWT
import { db } from "../db";
import { bookings } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import * as QRCode from "qrcode";

export const ticketRoutes = new Elysia({ prefix: '/ticket' })
  // 2. Tambahkan Konfigurasi JWT (Harus sama dengan yang di userRoutes)
  .use(
    jwt({
      name: 'jwt',
      secret: 'RAHASIA_SANGAT_AMAN_123', // Pastikan SECRET sama dengan di userRoutes
    })
  )
  /**
   * GENERATE TICKET & QR CODE
   * Diperkuat dengan pengecekan Token User
   */
  .get("/generate/:booking_id", async ({ params: { booking_id }, set, jwt, headers }) => {
    try {
      // 3. Validasi Token dari Header Authorization
      const authHeader = headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        set.status = 401;
        return { success: false, error: "Token tidak ditemukan" };
      }

      const token = authHeader.split(' ')[1];
      const payload = await jwt.verify(token);

      if (!payload) {
        set.status = 401;
        return { success: false, error: "Sesi Anda telah berakhir, silakan login kembali." };
      }

      const id = parseInt(booking_id);
      if (isNaN(id)) {
        set.status = 400;
        return { success: false, error: "ID Booking tidak valid" };
      }
      
      const result = await db.query.bookings.findFirst({
        where: eq(bookings.bookingId, id),
        with: {
          schedule: { 
            with: { 
              movie: true, 
              studio: { with: { cinema: true } } 
            } 
          },
          details: { 
            with: { seat: true } 
          },
          payments: {
            orderBy: (payments, { desc }) => [desc(payments.createdAt)],
            limit: 1
          }
        }
      }) as any;

      // 4. Validasi Keberadaan Data
      if (!result) {
        set.status = 404;
        return { success: false, error: "Data booking tidak ditemukan" };
      }

      // 5. Validasi Kepemilikan (Opsional tapi sangat disarankan)
      // Memastikan user yang login hanya bisa melihat tiket miliknya sendiri
      if (result.userId !== payload.userId) {
        set.status = 403;
        return { success: false, error: "Anda tidak berhak mengakses tiket ini" };
      }

      // 6. Validasi Status Pembayaran
      if (result.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { 
          success: false, 
          error: "Tiket belum tersedia", 
          detail: "Silakan selesaikan pembayaran terlebih dahulu." 
        };
      }

      // 7. Ambil Invoice ID untuk Konten QR
      const invoiceId = result.payments?.[0]?.externalId || `INV-RPLAY-${result.bookingId}-${Date.now()}`;
      
      // 8. Generate QR Code
      const qrBase64 = await QRCode.toDataURL(invoiceId, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 400,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      return {
        success: true,
        message: "Tiket berhasil dimuat",
        data: {
          booking_id: result.bookingId,
          invoice_id: invoiceId,
          movie: {
              title: result.schedule?.movie?.title,
              poster: result.schedule?.movie?.photoUrl,
          },
          location: {
              cinema: result.schedule?.studio?.cinema?.namaBioskop,
              studio: result.schedule?.studio?.namaStudio,
          },
          showtime: {
              date: result.schedule?.showDate,
              time: result.schedule?.showTime,
          },
          seats: result.details
            ?.map((d: any) => d.seat?.seatNumber)
            .filter(Boolean) || [],
          qr_code: qrBase64
        }
      };

    } catch (err: any) {
      console.error("Ticket Error:", err.message);
      set.status = 500;
      return { success: false, error: "Gagal memproses tiket digital" };
    }
  }, {
    params: t.Object({
      booking_id: t.String()
    })
  });