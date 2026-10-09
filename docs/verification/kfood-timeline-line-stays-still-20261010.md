# KFood Route Detail: only the circles move when stops are reordered

Date: 2026-10-10. Scope: Route Detail in `apps/shopify-app`. No server, driver app, Shopify data or production data change. Reported by the owner: only the circle of the timeline should move, but the line moved with it.

## Cause

Every stop of the timeline was one unit that held its order label, its own line segment and its circle, and the reorder animation (a 200 ms slide from the old place to the new one) moved the whole unit. The line of the timeline is made of those segments, so each segment slid together with its circle. Sampling the line while a stop was dragged over the third stop of a five-stop route showed it broken: a 63 px gap at 44 ms and a 12 px gap at 96 ms, whole again at 144 ms. The group (All routes) timeline had the same structure: the line and the circle of a stop were in one sliding segment.

## Change

- Child route timeline: the unit keeps the line. A new inner node, laid out on the same two rows (14 px label row, 24 px circle row, 2 px gap, centered), holds the order label and the circle, and only that node slides. The line comes first in the unit and is never inside the sliding node.
- Group timeline: the circle (its label is inside the button) is wrapped in a sliding node next to the line of its segment.
- The drag, its guards, the drop rules and the order of the stops do not change. The unit still takes the drag over, and the swap point with a neighbour is still the middle of that neighbour (the sliding node has the same horizontal center and width as the unit's content).

## Verification

Unit tests pin the structure (the line before the sliding node and outside it, in both timelines; the unit itself is not the sliding node and still takes the drag over; the sliding node keeps the unit's rows; the swap point still reads the sliding node's middle).

The real Route Detail page ran against synthetic transport (`scripts/route-status-browser-fixture.mjs`, Ready child route of a group):

- At rest nothing moved: the unit, the label, the circle and the line have exactly the rectangles they had before the change (unit 155 × 52, label 65 × 12, circle 24 × 24, line 155 × 2 at the same positions).
- While the first stop was dragged over the third, sampled every frame for 260 ms: all six line segments of the child timeline stayed at the same x in every frame, with no gap in the line, while the two stops that make room slid (circle x 279 → 245 → 242 and 434 → 401 → 398) and the dragged stop's circle stayed put.
- The same sampling on the lane "Ready child" of the group timeline: all six line segments stayed put in every frame and the circles slid (415 → 361 → 355 and 563 → 509 → 503).
- Cancelling the drag put every circle back.

Not covered locally: a recording of the animation. The check is numeric (rectangles per frame), not visual.
