"use node";

import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";

export const sendPasswordReset = internalAction({
  args: {
    to: v.string(),
    token: v.string(),
    expires: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    if (!apiKey || !from) {
      throw new Error("Password recovery email is not configured");
    }

    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: args.to,
      subject: "Reset your Jev's Budget password",
      text: [
        "We received a request to reset your Jev's Budget password.",
        "",
        `Your reset code is: ${args.token}`,
        "",
        `This code expires at ${args.expires} and can only be used once.`,
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    });

    if (error) {
      console.error("Resend password reset failed", error.message);
      throw new Error("Failed to send password recovery email");
    }

    return null;
  },
});
