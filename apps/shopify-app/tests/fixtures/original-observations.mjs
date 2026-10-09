export const routeId = '10000000-0000-4000-8000-000000000001';
export const window = { from: '2026-11-01T04:00:00.000Z', to: '2026-11-02T04:00:00.000Z', limit: 200 };
export function observation(index = 1, overrides = {}) {
  return { eventId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, observedAt: '2026-11-01T06:30:00.123456Z', storedAt: '2026-11-01T07:30:00.654321Z', latitude: 43.7, longitude: -79.4, accuracyMeters: 0, coordinateStatus: 'VALID', accuracyStatus: 'VALID', clientEventKey: null, ...overrides };
}
export function envelope(overrides = {}) {
  return { data: { schemaVersion: 1, routePlanId: routeId, source: 'DRIVER_EVENT_LOCATION_UPDATED', scope: 'CURRENT_ASSIGNMENT', window: { from: window.from, to: window.to }, observations: [observation()], page: { limit: 200, returned: 1, hasMore: false, nextCursor: null, totalReturned: 1, pointCap: 5000, capReached: false, snapshotAt: '2026-11-03T00:00:00.123456Z' }, emptyReason: null, ...overrides }, error: null };
}
