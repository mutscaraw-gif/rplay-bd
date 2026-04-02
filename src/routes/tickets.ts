import { Elysia, t } from "elysia";
import { db } from "../db";
import { bookings } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import * as QRCode from "qrcode";

export const ticketRoutes = new Elysia({ prefix: '/ticket' })
  /**
   * GENERATE TICKET & QR CODE
   * Mengambil data booking yang sudah sukses dan membuat QR Code berdasarkan Invoice ID
   */
  .get("/generate/:booking_id", async ({ params: { booking_id }, set }) => {
    try {
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
          // Mengambil data payment terakhir untuk mendapatkan externalId (Invoice ID)
          payments: {
            orderBy: (payments, { desc }) => [desc(payments.createdAt)],
            limit: 1
          }
        }
      }) as any;

      // 1. Validasi Keberadaan Data
      if (!result) {
        set.status = 404;
        return { success: false, error: "Data booking tidak ditemukan" };
      }

      // 2. Validasi Status Pembayaran
      if (result.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { 
          success: false, 
          error: "Tiket belum tersedia", 
          detail: "Silakan selesaikan pembayaran terlebih dahulu." 
        };
      }

      // 3. Ambil Invoice ID untuk Konten QR
      // Menggunakan externalId dari tabel payments, jika tidak ada gunakan fallback format
      const invoiceId = result.payments?.[0]?.externalId || `INV-RPLAY-${result.bookingId}-${Date.now()}`;
      
      // 4. Generate QR Code
      const qrBase64 = await QRCode.toDataURL(invoiceId, {
        errorCorrectionLevel: 'H', // High error correction agar mudah di-scan di layar HP
        margin: 2,
        width: 400,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      // 5. Return Final Data
      return {
        success: true,
        message: "Tiket berhasil dimuat",
        data: {
          booking_id: result.bookingId,
          invoice_id: invoiceId, // Menampilkan INV-RPLAY-14-1775100990012
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