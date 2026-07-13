import { textOrUndefined } from "./orders-page.shared.js";

const MAX_NEARBY_ORDERS = 5;
const MAX_DISTANCE_KM = 5;
const MIN_NEARBY_ORDERS = 3;
const MIN_AGREEMENT = 0.8;

export function getOrderAreaSuggestion(order, orders) {
  if (textOrUndefined(order?.deliveryArea) || order?.serviceType === "PICKUP") return null;

  const targetCoordinates = readCoordinates(order);
  if (targetCoordinates === null) return null;

  const nearbyOrders = (Array.isArray(orders) ? orders : [])
    .flatMap((candidate) => {
      if (candidate === order || (order?.id && candidate?.id === order.id)) return [];

      const area = textOrUndefined(candidate?.deliveryArea);
      const coordinates = readCoordinates(candidate);
      if (!area || area === "Pickup" || coordinates === null) return [];

      const distanceKm = getDistanceKm(targetCoordinates, coordinates);
      return distanceKm <= MAX_DISTANCE_KM ? [{ area, distanceKm }] : [];
    })
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, MAX_NEARBY_ORDERS);

  if (nearbyOrders.length < MIN_NEARBY_ORDERS) return null;

  const areas = new Map();
  for (const nearbyOrder of nearbyOrders) {
    const key = nearbyOrder.area.toLocaleLowerCase();
    const current = areas.get(key);
    areas.set(key, {
      area: current?.area ?? nearbyOrder.area,
      count: (current?.count ?? 0) + 1,
    });
  }

  const winner = [...areas.entries()].sort((left, right) => right[1].count - left[1].count)[0];
  if (!winner) return null;

  const [winnerKey, winnerValue] = winner;
  const requiredMatches = Math.ceil(nearbyOrders.length * MIN_AGREEMENT);
  if (winnerValue.count < requiredMatches || nearbyOrders[0]?.area.toLocaleLowerCase() !== winnerKey) {
    return null;
  }

  return {
    area: winnerValue.area,
    matchedOrders: winnerValue.count,
    nearbyOrders: nearbyOrders.length,
  };
}

function readCoordinates(order) {
  const rawLongitude = order?.coordinates?.[0];
  const rawLatitude = order?.coordinates?.[1];
  if (rawLongitude == null || rawLatitude == null) return null;

  const longitude = Number(rawLongitude);
  const latitude = Number(rawLatitude);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function getDistanceKm([leftLongitude, leftLatitude], [rightLongitude, rightLatitude]) {
  const latitudeKm = (rightLatitude - leftLatitude) * 111.32;
  const longitudeKm =
    (rightLongitude - leftLongitude) *
    111.32 *
    Math.cos(((leftLatitude + rightLatitude) / 2) * (Math.PI / 180));
  return Math.hypot(latitudeKm, longitudeKm);
}
