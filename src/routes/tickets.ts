import { Elysia, t } from "elysia"; // Tambahkan t untuk validasi param
import { db } from "../db";
import { bookings } from "../db/schema";
import { eq } from "drizzle-orm";
import * as QRCode from "qrcode";

export const ticketRoutes = new Elysia({ prefix: '/ticket' })
  .get("/generate/:booking_id", async ({ params: { booking_id }, set }) => {
    try {
      const id = parseInt(booking_id);
      
      // Menggunakan query builder Drizzle
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
          }
        }
      }) as any; // Cast ke any untuk menghindari error nested type inference yang kompleks

      // 1. Validasi keberadaan data dan status pembayaran
      if (!result) {
        set.status = 404;
        return { error: "Data booking tidak ditemukan" };
      }

      if (result.statusBooking !== "SUCCESS") {
        set.status = 403;
        return { error: "Tiket belum tersedia. Silakan selesaikan pembayaran terlebih dahulu." };
      }

      // 2. Generate QR Code
      // Kita tambahkan informasi unik di dalam QR
      const qrContent = `TIC-${result.bookingId}-${result.userId}`;
      const qrBase64 = await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });
      
      // 3. Return data yang rapi
      return {
        success: true,
        data: {
          booking_id: result.bookingId,
          movie: result.schedule?.movie?.title,
          cinema: result.schedule?.studio?.cinema?.namaBioskop,
          studio: result.schedule?.studio?.namaStudio,
          show_date: result.schedule?.showDate,
          show_time: result.schedule?.showTime,
          seats: result.details?.map((d: any) => d.seat?.seatNumber) || [],
          qrCode: qrBase64
        }
      };

    } catch (err) {
      set.status = 500;
      return { error: "Gagal memproses tiket" };
    }
  }, {
    // Tambahkan validasi parameter agar booking_id harus berupa string/numeric
    params: t.Object({
      booking_id: t.String()
    })
  });