// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { UpstashRedisAdapter } from "@next-auth/upstash-redis-adapter";
import { Redis } from "@upstash/redis";

// Uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env
const redis = Redis.fromEnv();

export const authOptions = {
  adapter: UpstashRedisAdapter(redis),
  providers: [
    EmailProvider({
      // SMTP without URL-encoding issues – user/pass from env
      server: {
        host: "smtp.gmail.com",
        port: 587,
        auth: {
          user: process.env.EMAIL_USER, // ex: you@gmail.com
          pass: process.env.EMAIL_PASS, // Gmail App Password (no spaces)
        },
      },
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      maxAge: 24 * 60 * 60, // magic link valid 24h
    }),
  ],
  session: { strategy: "jwt" },
  // debug: true, // uncomment if you need logs in Vercel Functions
};

export default NextAuth(authOptions);
