export const ORDERS_SESSION_RECOVERY_ERROR = Object.freeze({
  code: "UNAUTHORIZED",
  message: "Invalid Shopify session token",
  status: 401,
});

export function getOrdersLoaderDeliveryErrors(error, fallbackMessage) {
  if (error instanceof Response && error.status === 401) {
    return [{ ...ORDERS_SESSION_RECOVERY_ERROR }];
  }

  return [{
    code: "DELIVERY_API_ERROR",
    message: fallbackMessage,
  }];
}
