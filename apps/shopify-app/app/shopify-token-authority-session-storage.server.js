import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { markLegacyOfflineSessionForTokenAuthority } from "./shopify-token-authority.server";

export class TokenAuthorityPrismaSessionStorage extends PrismaSessionStorage {
  async loadSession(id) {
    return markLegacyOfflineSessionForTokenAuthority(await super.loadSession(id));
  }
}
