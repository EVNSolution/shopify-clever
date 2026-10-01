export function createOrdersResourceSessionTokenGetter(fetchSessionToken) {
  let inFlightRequest = null;

  return async function getOrdersResourceSessionToken() {
    if (inFlightRequest) return inFlightRequest;

    inFlightRequest = Promise.resolve()
      .then(() => fetchSessionToken())
      .finally(() => {
        inFlightRequest = null;
      });

    return inFlightRequest;
  };
}
