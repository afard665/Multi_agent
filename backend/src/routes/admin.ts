import { Router } from "express";

type AdminStatus = {
  enabled: boolean;
  mode: "key" | "insecure" | "disabled";
};

export function adminRouter() {
  const router = Router();

  router.get("/admin/status", (_req, res) => {
    const adminKey = (process.env.ADMIN_API_KEY || "").trim();
    if (adminKey) {
      const status: AdminStatus = { enabled: true, mode: "key" };
      return res.json(status);
    }

    const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
    const insecureAllowed = process.env.ALLOW_INSECURE_ADMIN === "true" || nodeEnv !== "production";
    if (!insecureAllowed) {
      const status: AdminStatus = { enabled: false, mode: "disabled" };
      return res.json(status);
    }

    const status: AdminStatus = { enabled: true, mode: "insecure" };
    return res.json(status);
  });

  return router;
}

