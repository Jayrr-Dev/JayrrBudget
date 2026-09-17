import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { applyPolarSubscriptionEvent, polar } from "./polar";

const http = httpRouter();

auth.addHttpRoutes(http);

polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.created": async (ctx, event) => {
      await applyPolarSubscriptionEvent(ctx, event);
    },
    "subscription.updated": async (ctx, event) => {
      await applyPolarSubscriptionEvent(ctx, event);
    },
  },
});

export default http;
