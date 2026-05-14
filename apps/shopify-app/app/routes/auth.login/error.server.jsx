import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

export function loginErrorMessage(loginErrors) {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Open this app from Shopify Admin to connect a store." };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Open this app from a valid Shopify store admin." };
  }

  return {};
}
