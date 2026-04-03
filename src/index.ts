import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";

// --- IMPORT SEMUA RUTE ---
import { adminRoutes } from "./routes/admin";
import { userRoutes } from "./routes/user";
import { movieRoutes } from "./routes/movies";
import { actorsRoutes } from "./routes/actors";
import { castsRoutes } from "./routes/casts";
import { citiesRoutes } from "./routes/cities";
import { cinemasRoutes } from "./routes/cinemas";
import { studiosRoutes } from "./routes/studios";
import { scheduleRoutes } from "./routes/schedule";
import { orderRoutes } from "./routes/order";
import { paymentRoutes } from "./routes/payment";
import { seatRoutes } from "./routes/seats";
import { ticketRoutes } from "./routes/tickets";

const app = new Elysia()
  // 1. KONFIGURASI CORS (Penting untuk koneksi ke Frontend)
  .use(cors({
    origin: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflight: true
  }))

  // 2. KONFIGURASI JWT (Global)
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "development_secret_key", 
    })
  )

  // 3. KONFIGURASI SWAGGER (Dengan Security Definition)
  .use(swagger({ 
    path: '/docs', // Akses dokumentasi di localhost:3001/docs
    documentation: {
      info: {
        title: 'RPlay Cinema API Documentation',
        version: '1.0.0',
        description: 'Dokumentasi API untuk Sistem Bioskop RPlay'
      },
      tags: [
        { name: 'Admin Auth', description: 'Autentikasi Admin' },
        { name: 'Admin Ticket System', description: 'Sistem Verifikasi QR Code' },
        { name: 'Movies', description: 'Manajemen Data Film' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    }
  }))

  // 4. PENGELOMPOKAN RUTE API
  .group("/api", (app) => 
    app
      .use(adminRoutes)
      .use(userRoutes)
      .use(movieRoutes)
      .use(actorsRoutes)
      .use(castsRoutes)
      .use(citiesRoutes)
      .use(cinemasRoutes)
      .use(studiosRoutes)
      .use(scheduleRoutes)
      .use(seatRoutes)
      .use(orderRoutes)
      .use(paymentRoutes)
      .use(ticketRoutes)
  )

  // 5. JALANKAN SERVER
  .listen(process.env.PORT || 8080);

export type App = typeof app;

console.log(`
  🚀 RPlay API is running!
  📡 URL: http://${app.server?.hostname}:${app.server?.port}
  📖 Docs: http://${app.server?.hostname}:${app.server?.port}/docs
`);