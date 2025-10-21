// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";

export const authOptions = {
  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER, // e.g. smtp://USER:PASS@HOST:PORT
      from: process.env.EMAIL_FROM,     // e.g. no-reply@cadconverts.com
      maxAge: 24 * 60 * 60,             // magic link valid 24h
    }),
  ],
  session: { strategy: "jwt" },
  // You can customize pages/emails later; defaults are fine for MVP.
};

export default NextAuth(authOptions);
