// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { UpstashRedisAdapter } from "@next-auth/upstash-redis-adapter";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const authOptions = {
  adapter: UpstashRedisAdapter(redis),
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      maxAge: 24 * 60 * 60,
      // Send magic link via Resend (no SMTP):
      async sendVerificationRequest({ identifier, url, provider }) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("Missing RESEND_API_KEY");

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from || "onboarding@resend.dev",
            to: identifier,
            subject: "Sign in to CADConverts",
            html: `
              <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.5">
                <h2>Sign in to CADConverts</h2>
                <p>Click the button below to sign in:</p>
                <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px">Sign in</a></p>
                <p style="font-size:12px;color:#666">If the button doesn’t work, copy & paste this link:</p>
                <p style="font-size:12px;color:#666;word-break:break-all">${url}</p>
              </div>
            `,
          }),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Resend send failed: ${res.status} ${txt}`);
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
};

export default NextAuth(authOptions);
