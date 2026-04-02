import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";

// Import rute
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
  // PERBAIKAN CORS: Tambahkan konfigurasi spesifik
  .use(cors({
    origin: true, // Mengizinkan asal request dari mana saja (origin frontend kamu)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Izinkan semua method
    allowedHeaders: ['Content-Type', 'Authorization'], // Izinkan header penting
    preflight: true
  }))
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "development_secret_key", 
    })
  )
  .use(swagger({ 
    path: '/docs',
    documentation: {
      info: {
        title: 'RPlay Cinema API',
        version: '1.0.0'
      }
    }
  }))
  .group("/api", (app) => 
    app
      .use(adminRoutes)
      .use(userRoutes)   // <--- Jangan lupa ini juga
      .use(movieRoutes)
      .use(actorsRoutes)
      .use(castsRoutes)
      .use(citiesRoutes)
      .use(cinemasRoutes)
      .use(studiosRoutes)
      .use(scheduleRoutes)
      .use(seatRoutes)    // <--- INI YANG KURANG
    .use(orderRoutes)   // <--- Jangan lupa ini juga
    .use(paymentRoutes) // <--- Dan ini
    .use(ticketRoutes)
  )
  .listen(process.env.PORT || 3001);

export type App = typeof app;

console.log(`🚀 RPlay API running on port ${app.server?.port}`);