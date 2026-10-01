import db from "../db.server";
import { createAppUninstalledWebhookAction } from "../features/delivery/app-uninstalled-webhook-admission.server";

export const action = createAppUninstalledWebhookAction({
  deleteSessions: (shop) => db.session.deleteMany({ where: { shop } }),
});
