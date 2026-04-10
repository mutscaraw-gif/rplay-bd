import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";

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

// Baca FRONTEND_URL dari .env, pisah per koma jadi array
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((url) => url.trim());

  console.log("CORS origins:", allowedOrigins)

const app = new Elysia()

  // 1. CORS — hanya izinkan frontend yang ada di .env
  .use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflight: true,
  }))

  // 2. JWT
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "development_secret_key",
    })
  )

  // 3. SWAGGER
  .use(swagger({
    path: "/docs",
    documentation: {
      info: {
        title: "RPlay Cinema API Documentation",
        version: "1.0.0",
        description: "Dokumentasi API untuk Sistem Bioskop RPlay",
      },
      tags: [
        { name: "Admin Auth", description: "Autentikasi Admin" },
        { name: "Admin Ticket System", description: "Sistem Verifikasi QR Code" },
        { name: "Movies", description: "Manajemen Data Film" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  }))

  // 4. ROUTES
  .group("/api", (app) =>
    app
      .use(orderRoutes)
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
      .use(paymentRoutes)
      .use(ticketRoutes)
  )

  // 5. LISTEN — 0.0.0.0 supaya bisa diakses laptop lain
  .listen({
    hostname: process.env.HOSTNAME ?? "0.0.0.0",
    port: Number(process.env.PORT) || 8080,
  });

export type App = typeof app;

console.log(`
  🚀 RPlay API is running!
  
  Local   : http://192.168.0.46:${app.server?.port}
  Tunnel  : https://wbvjvc-ip-182-8-193-165.tunnelmole.net
  Docs    : https://wbvjvc-ip-182-8-193-165.tunnelmole.net/docs

  CORS izinkan: ${allowedOrigins.join(", ")}
`);