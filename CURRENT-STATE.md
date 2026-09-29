# DWNC current state

- Updated: 2026-09-30, Codex
- Writer now: Codex Main (final verified checkpoint integration)
- Checkpoint: `39247fc` tracker / `10652be` three design drafts. Existing `submit-before/` remains unrelated and protected.
- AI work: T1 functional local MVP implementation and required verification PASS; commit integration pending.
- User decision: A selected by user on 2026-09-30 (message “a”). Release approval: not requested.

## Requests and finite finish line

| ID | User request / acceptance | Owner | Status | Evidence |
|---|---|---|---|---|
| T1 | Implement the DWNC brief: demo users, profiles, tennis/futsal/running, filter/create/apply/accept, results, today dashboard, ranking | design_preview → Codex Main integration | PASS | Local app at `http://127.0.0.1:4174/#/home`; final syntax and 7/7 domain tests PASS. Main's real browser critical journeys, all five pages at 390px, refresh, history, and console checks PASS. Human product acceptance is separate. |
| T2 | Make three design drafts for the user to compare and decide | design_preview → Codex Main | PASS | Three drafts render at `http://127.0.0.1:4173/#a`, `#b`, `#c`. Syntax, desktop and mobile viewing, mouse/keyboard switching, direct hash navigation and toggle read-back PASS. User design acceptance remains separate. |

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

T1 is implemented and verified with selected design A at 127.0.0.1:4174; the server remains running. Demo identities and records stay in this browser only, with an explicit local-demo notice; this is not real authentication or multi-device persistence. No required AI implementation remains. Next is user experience review of the completed local MVP; do not add optional groups/friends/maps/sharing/external APIs or deploy without a new user request. Keep all feedback/fixes with the current implementation owner.

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
