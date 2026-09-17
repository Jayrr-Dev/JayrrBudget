import polar from "@convex-dev/polar/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(polar);

export default app;
