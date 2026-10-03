# Community Workout Consensus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track steps below. User explicitly selected parallel subagents after approving the written design.

**Goal:** Deliver persistent local chat, agreed workout schedules, unanimously approved results, real manner stars and a confirmed-record SNS adapter.

**Architecture:** Existing authenticated Node/SQLite app remains canonical. Text messages use independent SQL writes and cursor reads; appointment/result proposals use existing transactional commands and remain separate from final results. New chat UI is a focused controller while root integrates existing app flows.

**Tech Stack:** Node 24.x, browser ES modules, SQLite, Better Auth/Zod, Node tests and Chromium Playwright. No new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-03-community-workout-consensus-design.md`

## Global Constraints

- Existing checkout and codex/dwnc-backend-auth; no worktree/branch switch, commit/push/deploy, external accounts/DB or submit-before access.
- Root alone writes CURRENT-STATE/README/HANDOFF/app.js/build files. Original designs, DB and servers are preserved.
- Light glass, max390px at every width, exactly four bottom navigation entries. Community adds chats.
- Group approval is unanimous over frozen scheduled participants, including claimed absences. Edited attendance cannot shrink approvers.
- Only final results enter state.results; pending proposals never affect Kong, ranking, ratings or sharing. Legacy records remain confirmed without invented timestamps.
- Real average/count, no virtual votes. Stars select then explicitly submit.
- No product dependency additions. API-key-free map URL only; no automatic location collection.

## Shared Interfaces (binding across workers)

State additions: `appointmentProposals`, `resultProposals` arrays (default empty for old pure fixtures).

Both proposal types: `{id,version,proposedBy,participantIds,approvedIds,status,createdAt}`; status is pending/confirmed/rejected/superseded/invalid. Appointment adds `{roomId,details,matchId?}`; result adds `{matchId,data,confirmedAt?}`. Details contains sport/title/region/venue/address/date/startTime/endTime/description and optional existingMatchId. Approval commands carry `{proposalId,version,decision:'accepted'|'rejected'}`.

Commands: `appointment.propose` payload `{roomId,participantIds,sport,title,region,venue,address,date,startTime,endTime,description,existingMatchId?,replacesId?}`; `appointment.decide`; `result.propose` payload identical to old result.save `{matchId,data}`; `result.decide`; old result.save routes through proposal semantics; existing rating.save remains final-only.

Chat API:
- GET /api/chats → `{rooms}`.
- POST /api/chats/open `{kind:'direct'|'group'|'match',peerId?,groupId?,matchId?,expectedUserId,requestId}` → `{room}`. Unique contextual room; repeats do not duplicate.
- GET /api/chats/:roomId/messages with optional after/before numeric cursor and limit≤100 → `{messages,cursor,hasMore?}`. Messages ascending; initial newest100, after earliest100 after cursor.
- POST /api/chats/:roomId/messages `{text,clientMessageId,expectedUserId}` → `{message}`; text1–1000, durable UUID dedup, no sports revision increment.
- Room `{id,kind,title,participantIds,peerId?,groupId?,matchId?,lastMessage?,updatedAt?}`. Message `{id:number,roomId,senderId,text,createdAt}`.

Public manner projection: user.publicMannerSummary=`{average:number|null,count:number}`. Preserve publicManner compatibility as actual average or0; no virtual baseline.

Chat UI exports `createChatController({request,getState,save,renderApp,openWorkout,notify,refreshState?})` → `{render,mount,dispose,setRoom,open,handleAction,handleSubmit}`. render→HTML; mount updates message lane/polling without full app rerender; setRoom(string|null); open(context) creates/opens room and sets #/community?tab=chats&room=id; handleAction(action,button) handles chat-*; handleSubmit(form) handles chat-message-form and chat-appointment-form. save uses root's current save(type,payload,message,icon)→Promise<boolean>. getState returns projected canonical state. Controller maintains drafts/scroll/account guards and stops polling when disposed/hidden.

Sharing export: `listConfirmedWorkoutShareData(state,ownerId,{date}={})` and `getConfirmedWorkoutShareData(state,ownerId,matchId)`. Exact v1 sport metrics/location/profile contract in spec; no chat/private peer data.

## Review Focus

- Outsiders/public discovery must not read chat or pending proposals.
- Attendance exclusion and edited versions must not bypass all scheduled reviewers.
- Polling must retain draft, focus and scrolled history; account changes must not expose old rooms.
- Replayed last approvals/text sends must create one record/schedule/message only.
- Direct appointment visibility must be participant-only; group/tennis counts and reschedule self-overlap must validate before finalization.

## Task 1: Transactional collaboration and chat backend (worker backend)

Files: create collaboration-domain.js/.test.js, backend/chat.js/.test.js, backend/migrations/002-collaboration.sql; modify backend/database.js, backend/commands.js, dwnc-app/extended-domain.js, dwnc-app/server.js, backend/integration.test.js and relevant extended-domain tests.

- [ ] Add failing real-domain/SQLite tests for pending vs final totals, unanimous approvals with attendance omission, immutable versions/rejection/cancellation, only-host running, duplicate conversion, private direct/group/match chat and nonincremented sports revision.
- [ ] Run Node tests and observe missing behavior.
- [ ] Implement proposal transitions/migration/chat APIs/public manner; freeze group roster, close direct appointments and expire old requests on reschedule.
- [ ] Update old immediate-result integration assertions to propose+approve; maintain existing auth/privacy/idempotency tests.
- [ ] Run owned tests to green and write evidence/report to .runtime/t26/backend-report.md. No Git commit.

## Task 2: Chat interface/controller (worker chat-ui, independent files)

Files: create dwnc-app/chat-view.js, chat.css, chat-view.test.js. Do not edit app.js, index.html or allowlists.

- [ ] Write a failing render/controller test for escaped long messages, group appointment choice and draft-safe message lane updates.
- [ ] Run it and observe failure.
- [ ] Implement the Shared Interfaces controller; list/room/composer/appointment proposal cards, change proposal resetting approval, explicit decisions and map links. Use established selected light glass style.
- [ ] Guard network retries with stable client UUID and account/room lifecycle; preserve focus/scroll and polling visibility.
- [ ] Run owned tests and write .runtime/t26/chat-ui-report.md.

## Task 3: Profile stars and SNS projection (worker profile-share, independent files)

Files: modify passport-view.js/passport-view.test.js; create workout-share-data.js/.test.js and docs/workout-share-contract.md. Do not edit extended-domain.js, cards.js or app.js.

- [ ] Add failing actual-rating empty/partial/5-star/accessibility tests and confirmed-only sport/legacy/share privacy tests.
- [ ] Run to establish RED.
- [ ] Render publicMannerSummary on profile (owner and visitor) and implement pure exact v1 adapter with literal independently derived metric assertions.
- [ ] Verify owned Node tests; document teammate import and schema with no change to their branch; write .runtime/t26/profile-share-report.md.

## Task 4: App integration and real-browser verification (root, then E2E worker)

Files: app.js, index.html, app.css/service-glass.css as needed, package.json, scripts/build.mjs/smoke-build.mjs, e2e/journey.spec.js/kong-profile.spec.js/service-navigation.spec.js and new collaboration.spec.js, root docs.

- [ ] Capture read-only original preview/DB hashes and run existing baseline before feature writes.
- [ ] Integrate chat controller and tabs/routing; add friend/group/match open actions, approval UI in workout detail, version-aware result proposal submission and explicit star submit.
- [ ] Trigger reward only when canonical attended total increases on final result confirmation, including received confirmation refresh exactly once.
- [ ] Add runtime/test files to explicit allowlists and commands, preserving cards.js for teammate integration.
- [ ] Adapt Chromium journeys for mutual approval; add friend appointment and group unanimous-result/chat/privacy tests at320/390/1280, polling composer retention and refresh persistence.
- [ ] Run npm run check, test:e2e, test:build, whitespace check; review actual browser/screenshot. Fix real failures and rerun affected checks.
- [ ] Independent final backend/UI review with concrete diff/report package; resolve important findings and reverify.
- [ ] Update README/HANDOFF/CURRENT-STATE with exact verification/preservation and local preview. Release tracker; leave changes local for user review.

## Execution Decisions

User's explicit proceed/maximize-subagents instruction selects immediate parallel execution. File ownership makes Tasks1–3 independent; root integrates Task4. The standing existing-checkout preference overrides creating a new worktree. There is no further approval question for reversible local implementation. Final publication remains outside scope.
