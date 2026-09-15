"use node";

import nodemailer from "nodemailer";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const sendPasswordReset = internalAction({
  args: {
    to: v.string(),
    token: v.string(),
    expires: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM;
    if (!host || !Number.isFinite(port) || !user || !password || !from) {
      throw new Error("Password recovery email is not configured");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass: password },
    });

    await transporter.sendMail({
      from,
      to: args.to,
      subject: "Reset your Jayrr's Budget password",
      text: [
        "We received a request to reset your Jayrr's Budget password.",
        "",
        `Your reset code is: ${args.token}`,
        "",
        `This code expires at ${args.expires} and can only be used once.`,
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    });

    return null;
  },
});
