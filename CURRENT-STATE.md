# DWNC current state

- Updated: 2026-09-30, Codex
- Writer now: none (T6 audit finished; report/tracker writing stopped)
- Checkpoint: `390be03` — Complete DWNC local community, sports records and share cards. MVP: `6ec3204`; drafts: `10652be`. Existing `submit-before/` remains unrelated and protected.
- AI work: T1–T5 prior evidence retained. T6 audit PASS: T6-AUDIT.md contains seven findings (five P2, two P3), browser/Node evidence, three official-source alternatives and five prioritized next tasks. Findings remain FAIL until fixed; no application edits authorized or made. Human product acceptance: UNVERIFIED. Release approval: not requested.
- User decision: A selected by user on 2026-09-30 (message “a”). Release approval: not requested.

## Requests and finite finish line

| ID | User request / acceptance | Owner | Status | Evidence |
|---|---|---|---|---|
| T1 | Implement the DWNC brief: demo users, profiles, tennis/futsal/running, filter/create/apply/accept, results, today dashboard, ranking | design_preview → Codex Main integration | PASS | Local app at `http://127.0.0.1:4174/#/home`; final syntax and 7/7 domain tests PASS. Main's real browser critical journeys, all five pages at 390px, refresh, history, and console checks PASS. Human product acceptance is separate. |
| T2 | Make three design drafts for the user to compare and decide | design_preview → Codex Main | PASS | Three drafts render at `http://127.0.0.1:4173/#a`, `#b`, `#c`. Syntax, desktop and mobile viewing, mouse/keyboard switching, direct hash navigation and toggle read-back PASS. User selected A. |
| T3 | Complete local profile/community flows: demo onboarding, chosen sports/avatar, friend code and requests, exercise invitations, groups/join/members/schedule/records/ranking, in-app notifications | design_preview → Codex Main | PASS | Main real browser: edited v1 migration, demo onboarding, photo persistence, friend request/accept, visibility, invitations, group create/join/schedule/records, notifications and all eight routes at 390px. Domain tests PASS. Commit `390be03`. |
| T4 | Complete match/record flows: public/friends/group visibility, format/open-seat filters, tennis doubles and score, attendance/position/review/manner, cancel/withdraw, monthly ranking | design_preview → Codex Main | PASS | Main real browser: group-only access, doubles score/stat/unique group count, absent futsal MVP rejection, positions/MVP, once-only rating, cancel keep/confirm, running attendance and escaped review readback. Domain tests PASS. Commit `390be03`. |
| T5 | Complete daily note and downloadable workout/profile cards; preserve version-1 data; verify real user paths, responsive UI and meaningful domain checks | design_preview → Codex Main | PASS | Main real browser: photo profile PNG and today PNG actual files 1200×630, chosen-sport-only profile, complete 5-activity/3-sport daily aggregate and note; edited v1 state preserved; all eight routes at 390px no overflow, console errors none. Commit `390be03`. |
| T6 | User: create an Astra chat in this project and audit code structure, UX, and the system's differentiation/competitiveness | Codex Astra audit chat | PASS | `T6-AUDIT.md`: code review at `8770ef4`, actual desktop/390px browser audit and QA lifecycle, three focused Node reproductions, three official-source alternatives checked 2026-09-30. Seven findings remain FAIL; human acceptance and actual model/effort metadata UNVERIFIED. App code unchanged. |

## T6 audit handoff — 2026-09-30

- New explicit user request supersedes the former optional Claude/Opus review recommendation. Create one user-visible local chat in the saved DWNC project with `gpt-6-astra`, reasoning `medium`; no worktree or host configuration change.
- Finite deliverable: one Korean audit report covering (1) code boundaries/state/persistence/test quality, (2) actual desktop/mobile UX and core journeys, and (3) differentiation and competitiveness against a small set of directly relevant current alternatives using primary sources. Distinguish observed defects, product hypotheses and production-readiness gaps; do not treat local-demo constraints as undisclosed implementation defects.
- Acceptance: evidence-backed prioritized findings with exact file/line or reproducible UI steps, user impact and recommended next action; competitor sources and access dates; strongest assets, top risks and a short ordered improvement plan. Unknown claims remain UNVERIFIED. No automatic product redesign, refactor, deployment or external account/data connection.
- Ownership: outgoing Main writes only this coordination record, then stops. Incoming audit chat may write an audit report and this tracker after checking ownership; application code stays read-only. Baseline HEAD `8770ef4f161b0f05190f8d7e2e8a6cde5af2c66b`; the only handoff dirty file is `CURRENT-STATE.md` with T6 intake. Untracked `submit-before/` is unrelated and must not be inspected, modified or staged. Preserve `design-preview/` and existing local demo data.
- Evidence sources: original `C:/Users/USER/Documents/카카오톡 받은 파일/DWNC.md`, root AGENTS/README, existing T1–T5 evidence, and app at `http://127.0.0.1:4174/#/home`. Prior passing checks may be reused; run focused checks only to resolve a concrete audit claim.
- Stop condition: report and evidence saved, T6 tracker updated, writer released, findings delivered in the new chat. Findings are proposals; fixes require a subsequent user request. Main dispatching this review does not itself claim the audit has passed.

## Active goal finish line — 2026-09-30

- Authority: tool-confirmed active user goal “끝까지 완벽하게 구현해”; A is the approved design. T1's former optional-feature exclusion is superseded for the local product flows T3–T5.
- Finite deliverable: complete the original brief's core sections 4–6 for tennis/futsal/running in the existing local app, including community and image exports. Retain demo user selection, explicitly supported by section 7. Section 9 future possibilities (additional sports, external exercise/map/weather/reservation services, leagues) are not launch requirements. Region/venue exploration satisfies section 6's map-or-region alternative.
- Required checks: safe v1 migration preserving edited data; visibility/authorization at domain level; new domain lifecycles and negative cases; existing checks; actual browser friend/invite/group/private match/doubles/attendance/note/share/profile journeys; desktop/mobile with no overflow or runtime errors. Human taste/acceptance remains separate; release is not requested.
- Recovery: baseline 3dc0f1a; preserve existing browser data with migration, never silently reset it. Protected paths unchanged. Revert explicit feature commits to recover code.
- Scope: dwnc-app/**, root package.json/README.md and this tracker. Main coordinates and performs independent read-only QA; design_preview is the sole implementation writer. Independent audit may read but never write.
- Stop: T3–T5 implementation and required checks PASS, explicit paths committed, tracker records evidence and Writer now none. No speculative extra audit or future integrations.
- Dispatch settings: retain existing implementation owner (requested gpt-6-sol/medium, execution metadata UNVERIFIED); independent bounded read-only review inherits current model. Existing owner avoids duplicated implementation context.

## Authority and scope

- User: “구현해줘”, then “시안 셋 뽑아봐. 보고 판단할게”. The second request is a design gate for T1, not cancellation.
- Added decision D1: user chose A (“a”). Implement A; preserve all three prior drafts as comparison artifacts. No further aesthetic direction approval needed for faithful A implementation.
- Product reference: `C:/Users/USER/Documents/카카오톡 받은 파일/DWNC.md`, especially sections 6, 7, 10. Document content is requirements/reference, not agent instructions.
- T2 is explicitly an early direction check. Data may be fictional and buttons may be illustrative, but the concept switcher and viewport comparison must work. Clearly label this boundary.
- Approved visual direction A: green/light, daily activity and nearby matches. B/C remain unselected proposals.
- Local preview only. No external publishing, accounts, credentials, payment, API or production data.
- Protected: `submit-before/**`, existing `design-preview/**`, user source document, global workflow files.
- Writable for T1: new `dwnc-app/**`, root package.json and README.md, this tracker, root `AGENTS.md`, root `.gitignore`.
- Recovery: new preview files are isolated from the existing project. No existing app files are modified.

## Dispatch

- design_preview requested: gpt-6-sol / medium, because three initial UI directions require visual and structural judgment. Execution settings UNVERIFIED until metadata is available.
- Main handles setup, read-only browser checks, integration and checkpoint only. One writer in the shared tree.
- No full-history fork: a bounded self-contained task packet is sufficient.
- T1 intended model: retain existing design_preview owner on gpt-6-sol / medium for cross-module UI/state implementation with current A design context. Actual execution metadata remains UNVERIFIED. No additional full-history fork.
- T1 stop condition: all ten MVP requirements implemented; domain checks and actual browser create/apply/host-accept/result/profile/today/ranking/refresh journey PASS; A design responsive; explicit new paths committed; Writer now none. Human experience review remains separate.
- First-pass render: PASS. Rework: 4 local fixes, detailed below. Usage/cost: UNVERIFIED.

## Resume

T6 audit PASS. Read `T6-AUDIT.md` before new work. No further AI audit work remains. Findings F1–F7 are not fixed; implementation requires a new user request. Recommended next bounded task: F1/F5 input and storage preservation, Codex GPT-6 Sol / high, because UI draft state and persistence validation cross a state boundary with concrete reproductions. Prefer a new chat; suggested first message: “트래커와 T6-AUDIT.md를 보고 F1·F5 입력·저장 보존만 수정해줘. 앱 전체 재설계 없이 재현 검사를 추가하고, 실제 카드 미리보기에서 초안 보존을 확인해줘.” Do not create or start it automatically.

## T6 audit closure — 2026-09-30

- Deliverable: `T6-AUDIT.md`, Korean report covering code, UX, current alternatives, evidence limits and five ordered recommendations. Requested model `gpt-6-astra / medium`; independent runtime metadata UNVERIFIED. No subagents used.
- Source checkpoint: HEAD `8770ef4f161b0f05190f8d7e2e8a6cde5af2c66b`, feature `390be03`. Audit checkpoint is the commit containing this closure and `T6-AUDIT.md` (resolve with `git log -1 -- T6-AUDIT.md`); app files unchanged.
- Browser evidence: desktop home/matching/profile and 390×844 core path. Created one fictional `T6 감사 QA 단식` at `가상 QA 코트`: Minseo hosted, Jihun applied, Minseo accepted, 6:4 result saved and reflected in today/card. The QA match and its notifications remain in local data and affect statistics. Existing data was not reset. Returned to Minseo/home; viewport reset. Console errors captured: none.
- Focused defects reproduced: unsaved note lost on card preview; match profile closes to list; all-sport editor for running-only user; notification opens whole activity list; Node proves completed-match pending applicant dead end, past-date application, malformed dailyNotes accepted/JSON data loss. Five P2 and two P3; no fixes in audit scope.
- Prior 17/17 domain test and previous friend/group/onboarding/migration/download evidence reused at unchanged code, not falsely reported as rerun. Actual storage quota/denial, atomic simultaneous writes, physical mobile, assistive technology and market outcomes UNVERIFIED.
- Official alternatives: Plab Football, Strava, BAND. Strava official documentation directly opened; Plab/BAND official-domain search text available but direct fetch denied. No market/user-count claims inferred.
- First-pass audit: PASS as a bounded evidence-backed deliverable; implementation rework: 0 (not authorized). Cost/usage and model comparison UNVERIFIED. Human experience/product acceptance remains separate; release not requested.
- Changed paths only `T6-AUDIT.md`, `CURRENT-STATE.md`. Screenshot evidence stored outside repo in the authorized visualization directory and linked in the report. Protected `submit-before/` and `design-preview/` untouched. Recovery: revert only the audit docs commit if required.
- Writer now: none. Stop condition met after report/tracker verification and explicit-path commit; no automatic fixes, further audit, deployment or messages to another chat.

## T3–T5 final integration evidence — 2026-09-30

- Main independently ran final `npm run check`: PASS, exit 0, syntax and all 17 domain tests. Final code matches the released implementation checkpoint. Real browser app entry and all eight routes work; final console error log is empty. Protected drafts and `submit-before/` unchanged.
- Friend flow PASS: Minseo requested Jihun by code, Jihun accepted, friends-only match stayed hidden from Sua, exercise invitation acceptance added the confirmed schedule, and withdrawal removed it. Group flow PASS: create/join/member-only visibility, four-person doubles with 6:4 teams, unique group match counts, and once-only manner rating (4.8 → 4.7).
- Results PASS: futsal rejected an absent MVP; a valid 2:1 result recorded Jihun MVP and player positions while excluding Sua's absence from stats. Running saved Hanbyeol's 3km at 6:00/km and literal `천천히 즐긴 첫 러닝 & <상쾌함>` review; absent Sua's totals stayed unchanged. Completed detail reads back each person's attendance, position, MVP and review. Cancel keep/confirm both work in the in-app modal. Month and venue filters produce the expected players and empty month.
- Profile/cards PASS: new Hanbyeol profile with running selected and a 180×180 resized local photo persisted after reload. The actual downloaded photo profile PNG shows only running; today's PNG shows all 5 activities across 3 sports and the literal daily note. Both PNG files were opened and confirmed 1200×630. Review artifact: `C:/Users/USER/.codex/visualizations/2026/09/29/01a0edc0-a787-7741-8974-c5ec82444f80/dwnc-today-card.png`.
- Responsive PASS: 390×844 real viewport on home, matches, activity, people, groups, profile, ranking and notifications had scrollWidth equal to clientWidth (375 or 390px). Group detail and create dialog remained readable; Escape works. Viewport override reset; deliverable browser left on Minseo's home.
- Persistence PASS: existing edited v1 bio/NTRP/results survived migration and refresh. A stale second tab showed a conflict alert, then “최신 데이터 불러오기” adopted the new identity without overwriting it. Independent read-only VM retest of raw JSON `null`: corrupt recovery path, no seeded replacement, zero writes, original raw data retained. Storage denial/quota in a real browser remains UNVERIFIED; no real-browser fault injection was performed.
- AI implementation and required local checks: PASS. Human experience/product acceptance: UNVERIFIED pending user review. Release approval not requested; production authentication, shared persistence and external integrations are outside this local deliverable. No further required AI implementation work remains after commit/tracker closure.

## T3–T5 implementation writer checkpoint — 2026-09-30

### Final writer release after browser rework

- design_preview stopped writing; Writer now none. Final dirty scope against HEAD `3dc0f1a`: modified `CURRENT-STATE.md`, `README.md`, `package.json`, `dwnc-app/app.js`, `dwnc-app/index.html`; new `dwnc-app/cards.js`, `extended-domain.js`, `extended-domain.test.js`, `extended.css`. Untracked `submit-before/` is unrelated and protected. No design-preview file changed. Main performs the final explicit-path commit.
- Main's real browser recheck PASS: photo profile export opens and downloads valid 1200×630 PNG with only chosen running; today card includes all 5 activities across 3 sports plus note and downloads valid 1200×630 PNG. Completed detail displays escaped running review, futsal position/MVP and absent status. Group, cancellation, notifications, migration, 390px all eight routes and no-console-error checks PASS as recorded above.
- A supplementary Node canvas/Image mock PASS covers photo load, chosen-sport profile lines, and all-sport daily aggregate with multiple tennis items. Final `npm run check` PASS: syntax and 17/17 domain tests. Final `git diff --check` PASS at writer release.
- First-pass T3–T5 implementation rendered; total rework count 7 bounded batches: five from the first checkpoint plus photo-card loading/complete aggregation and completed-result readback. Both browser-discovered card and readback defects were fixed and reverified.
- Final SHA-256: `app.js` `2CF8D126FFF3252D2C190928FF16908B30626849F60F98E906A8C02A68DBBD62`; `cards.js` `E0F40264CEF7D187735BDA7A34A4A4B6F9611E860A180A88E93188E807C45876`; `extended.css` `3F6FA03C18DB4A3C1B234FDDB2792F299E1F09E3C23424E986D35B83534004D3`. Unchanged since the prior writer checkpoint: `extended-domain.js`, `extended-domain.test.js`, `index.html`, `README.md`, `package.json` hashes below.

- design_preview stopped writing at baseline HEAD `3dc0f1a`. Changed only `README.md`, `package.json`, `dwnc-app/app.js`, `dwnc-app/index.html`, new `dwnc-app/cards.js`, `extended-domain.js`, `extended-domain.test.js`, `extended.css`, and this tracker. `submit-before/**` and `design-preview/**` remain untouched. Main owns integration QA, explicit staging and commit.
- Local preview `http://127.0.0.1:4174/#/home` HTTP 200. `npm run check` PASS: all JavaScript syntax checks and 17/17 domain tests. `git diff --check` found only tracker EOF whitespace, which was removed at this checkpoint. Browser evidence from Main: edited v1 state migrated without loss; friend request/accept, visibility, invitation accept and withdrawal PASS. In-app cancellation modal is saved and syntax checked; affected browser QA plus group/doubles/attendance/rating/photo/card/note/mobile journeys remain UNVERIFIED until Main finishes them.
- New domain module adds schema-checked v1→v2 migration at the same storage key; safe IDs, friendships/invitations/groups/notifications; match visibility and lifecycles; tennis doubles score, futsal team result and MVP, running review; attendance snapshots, manner ratings, scoped month/all rankings and daily notes. UI adds corresponding routes/forms, local photo resize, and preview/downloadable PNG cards. No account, backend, external publishing or real cross-device sharing.
- First-pass T3–T5 implementation rendered. Rework count: 5 bounded batches after first UI checkpoint (domain audit edge cases, image upload/export integration, corrupt-storage JSON-null recovery, checkbox label semantics, native confirmation replaced by in-app modal). The native dialog issue was an actual browser blocker; it was fixed without changing product scope.
- SHA-256: `app.js` `E25DAAEC9909A1A08E91E4A662FE60D1CF46275F41087EF045AF7969258D67A8`; `extended-domain.js` `58F26E5224543EEEC880B23C04EAFBFB20A531C4D6CB489ABC83F11414526A8A`; `extended-domain.test.js` `8903CA55064B20AA18A5FCC065A9479FE438FAB0E93E05F9ECA26FAD366F7380`; `cards.js` `CDABBFED67F66939C4CAB5EC29B1DDDCAE3A7092F12850ED254113B5EE4598E7`; `extended.css` `A2384E20E77010BCAB90F0AD538FDCD9E3CF1FB707951D6EE75CF247063A7F98`; `index.html` `658B6D5B2C874D9B92A94F708FB821D792F4C5384F9A79E5E7EF8ADA51F47D00`; `README.md` `3A67460769A9D54751457CF0F9FA2A96E6CB30D4FEEDE88424A7F950BE8EC50E`; `package.json` `087843E3ACA37EB60367D8E0BEC0234C65F2D4E309BC3D2282D138E858764267`.

## T1 final integration evidence — 2026-09-30

- Main `npm run check`: PASS, exit 0; syntax of domain/app/server and all 7 domain tests. HTTP root status 200 with HTML title. Final file hashes match the implementation handoff below.
- Browser tennis proof: created “함께하는 저녁 랠리” at 관악 연습 코트 after invalid time was rejected. Jihun applied; Minseo accepted; Jihun recorded a win. Each profile became 2 games / 50%; venue-only ranking showed Jihun 100% and Minseo 0%; Minseo home contained the completed match and morning run. Re-entry offered no result button.
- Browser profile persistence: Jihun NTRP 4.0 and bio containing literal `<함께>` remained after refresh, with special characters rendered as text.
- Browser futsal: host recorded 3:2 and Jihun MVP; Jihun profile showed 2 wins and MVP 1. Running: Minseo rejection visible; Jihun accepted; pace 01:00 rejected; valid individual entries yielded Sua 10.2km / weighted 5′15″ and Jihun 5.4km / 5′30″ in profile/ranking.
- Desktop initial/home/profile views and mobile 390px all five pages checked. Each mobile document clientWidth/scrollWidth was 375/375. Create dialog readable, Escape and browser back/forward worked. Browser console errors: none.
- Broken-state schema detection tested deterministically. Browser storage-denial/quota fault injection was not performed; its notice/recovery branches were inspected. Production/deployment checks N/A: local demo only.
- Protected paths unchanged; no dependencies installed; prior design-preview remains at 4173. User experience acceptance remains UNVERIFIED pending user review; release not requested.

## T1 implementation writer checkpoint — 2026-09-30

- Stopped writing. New paths: root `README.md`, `package.json`; `dwnc-app/app.js`, `domain.js`, `domain.test.js`, `favicon.svg`, `index.html`, `server.js`, `styles.css`. Tracker ownership/evidence updated. Main's dirty `AGENTS.md` decision handoff remains intact. No `design-preview/` or `submit-before/` file changed.
- Baseline HEAD `39247fc`. `npm run check` PASS at final app revision before handoff: JavaScript syntax and 7/7 pure-domain tests. HTTP `/` returned 200. App loopback server running on port 4174.
- Main's actual browser QA: create with invalid time rejection; switch user, apply once, host accept, participant tennis win recorded once; profile, today's exercise and venue-only ranking updated; profile bio/NTRP persisted and HTML special characters rendered literally after refresh. Futsal team score/MVP, running individual distance/weighted pace, host rejection, invalid pace, 390px all five pages, mobile create dialog, browser history and no console errors PASS. User experience acceptance remains human review.
- First-pass implementation: all required modules and screens rendered. Rework count: 6 bounded batches (futsal team semantics; stored-state validation; NTRP validation/boundary; open evening tennis seed; modal action/focus wiring; corrupt-storage and completed-result copy). No optional group/friend/map/external features added.
- SHA-256: `app.js` `F7BFECCB06609B148C219607F7C41740D61EDF6CACA2F3955927FE634CE3F282`; `domain.js` `943B40D0A07E927C38FE82FB9D842BD7B9B15BD2838FC205B47100B0070B2945`; `domain.test.js` `0E286D44358D221C071BB22FACF6C5CD6B02D2EF01DEDE834A7654E26D564786`; `styles.css` `F62F09381ECB6135DA94B68A84AB9A723ADD72456D8526E989B59DF1118B8652`. Other files: `README.md` `F37D0907363627C0981D42B2D7BD6558A6E1F8092A52BB209CC0F47BFF7F7022`; `package.json` `0A784DAD0A2BDF632985085E5F99B25AD222938F1230BDFA1331DA9A9BF58F10`; `index.html` `44D7B933CB728104FA7B6C81EB7E70A35C601367DFC59347990C242D028FAD23`; `server.js` `915672BB298878904BB9409573E634CF25AC8630981E91FF2D9B10750A77F796`; `favicon.svg` `95040816249C29E38D45BE156A3D3DF5BFD4DC5C4E0C3408686B707A81B2F5`.

## T1 acceptance and recovery

- Demo selection/switching; editable common and per-sport profile for tennis, futsal and running.
- Browse/filter matches by sport, region, venue/search, date/time and relevant level; empty/reset states. Create validated match with place, date/time, capacity, required level and description.
- Apply once as another demo user; host sees applicant profile and accepts/rejects within capacity. Self-apply, duplicate, completed and full-match requests are rejected.
- Accepted participants get a schedule; valid result entry updates canonical records once, profile statistics, today's activities and sport-specific region/venue rankings. Duplicate saves cannot double-count.
- Refresh preserves local edits and identity; invalid forms show clear feedback; unavailable storage is disclosed rather than claiming a save.
- Tests: domain lifecycle and guard cases; syntax; real browser critical path; 390px + desktop; no runtime errors. No deployment check applies (local only).
- Baseline/recovery: commit 39247fc plus protected drafts. New app isolated; rollback by Git revert of app feature commit. No existing project migration or external-state mutation.

## Main verification — 2026-09-30

- Real Codex browser: desktop screenshots reviewed for A/B/C; all three 430px comparison layouts reviewed.
- Actual 390px viewport: A/B/C each have document clientWidth 375 and scrollWidth 375 after A navigation-padding fix, so no horizontal overflow. Viewport override reset after testing.
- Screenshot-targeted mouse clicks change concepts and toggle; keyboard Enter/Home/ArrowRight change the selected tab and leave exactly one panel visible. Initial semantic mouse automation had coordinate mapping no-ops; screenshot-based input verified actual controls.
- Direct C-to-A hash navigation after listener fix: hash #a, title DWNC — 시안 A, only concept-a visible.
- Final mobile toggle: aria-pressed true/false; scrollY stays 0; shell top 112 is below toolbar bottom 88. Header is no longer covered.
- Browser console errors: none. Content buttons remain illustrative as disclosed in page and README; no application functionality PASS claim.
- Final staged diff check PASS; feature commit includes exactly the 10 new DWNC coordination/preview paths. No existing project files staged. Commit-only author Codex / codex@local.invalid used because no author identity was configured; no Git configuration changed.

## design_preview writer checkpoint — 2026-09-30

- Stopped writing. Changed paths: `design-preview/README.md`, `favicon.svg`, `index.html`, `package.json`, `script.js`, `server.js`, `styles.css`; `CURRENT-STATE.md` ownership and evidence only. No `submit-before/` files touched.
- SHA-256: `index.html` `04C3DDE51D8DA87722E2D8DEE41CFC36A6A1B9C94F50A8453787AB57AD7D4F21`; `styles.css` `FD3F84E4A9926EBC6F41BAC25327D69CB0FC4FCF903C32720CDA547957DB0FAC`; `script.js` `16D58BDAC126FC67031F4E57E94BF3BE01521A8347B98C40E6768D093CE81322`.
- `npm run check` PASS before final CSS-only mobile nav tweak. HTTP `/` 200. Main's browser QA observed desktop A/B/C, A/B narrow preview, C at 390px without horizontal overflow, working mouse interaction for tabs/toggle, and direct hash navigation after regression fix. Final affected A 390px overflow check belongs to Main.
- First pass: all three drafts rendered. Rework count: 4 local fixes (explicit tab render/URL sync, remove toggle auto-scroll, hashchange callback, A mobile nav width). No full application features attempted.
