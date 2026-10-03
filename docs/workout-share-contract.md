# Confirmed workout share input v1

Import the pure adapter in the renderer's ES module:

```javascript
import { listConfirmedWorkoutShareData, getConfirmedWorkoutShareData } from './workout-share-data.js';

const todayRecords = listConfirmedWorkoutShareData(state, ownerId, { date: '2026-10-03' });
const record = getConfirmedWorkoutShareData(state, ownerId, matchId);
if (record) renderWorkoutCard(record);
```

Pass the authenticated, server-projected state already visible to the caller. The adapter does not fetch data or grant access to private records. Exporting a card or publishing it remains the calling feature's explicit user action. This module does not change the teammate branch, existing `cards.js`, or any SNS account.

The list returns newest date/start time first; `date` is an optional exact calendar-date filter. Lookup returns `null` if the owner, match or final attended result is unavailable. Each output is detached from input state.

```typescript
type WorkoutShareMetricsV1 =
  | { kind: 'tennis'; noContest: boolean; scoreA: number | null;
      scoreB: number | null; outcome: 'win' | 'loss' | 'no-contest' }
  | { kind: 'futsal'; scoreFor: number; scoreAgainst: number;
      outcome: 'win' | 'loss' | 'draw'; isMvp: boolean; position: string | null }
  | { kind: 'running'; distanceKm: number; paceSec: number; review: string | null };

type WorkoutShareDataV1 = {
  schemaVersion: 1;
  recordId: string; // matchId; one canonical result per match
  ownerId: string;
  confirmation: { status: 'confirmed'; confirmedAt: string | null; legacy: boolean };
  sport: 'tennis' | 'futsal' | 'running';
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm, Korean local time
  endTime: string;
  title: string;
  location: {
    label: string; address: string; region: string;
    latitude: null; longitude: null; placeId: null; provider: null;
  };
  profile: { displayName: string; avatar: string; photo: string | null };
  participantCount: number; // actual attendees, not capacity or applicants
  metrics: WorkoutShareMetricsV1;
};
```

Only canonical `state.results` supplies records. Pending proposals, unrecorded schedules and people marked absent supply no share input. New records use the server's ISO 8601 `result.confirmation.confirmedAt`; historical records without confirmation metadata use `confirmedAt: null` and `legacy: true`. No timestamps or approval lists are invented.

Tennis A/B scores retain the canonical team ordering; `outcome` belongs to the requested owner. Historical unknown scores remain null. A no-contest record has null scores and `outcome: 'no-contest'`. Futsal retains the current one-team score model; `isMvp` and `position` belong only to the owner. Running `paceSec` is seconds per kilometre, and `review` belongs only to the owner. Missing or empty position/review is null.

Location uses the agreed structured location when present, otherwise existing venue/address/region fields. A missing address is an empty string. Coordinates and provider fields remain null until an actual map provider is added. Profile photos retain the existing bounded PNG/JPEG/WebP data-URL validation; missing or invalid photos are null.

The adapter allowlists every field. It omits chat text, proposal/approval details, friend codes, biography, individual manner votes, other attendees' identity, detailed running entries/reviews, MVP identity and other positions. Render text as text or escape it when building HTML; this data contract does not contain HTML.
