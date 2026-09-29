# DWNC current state

- Updated: 2026-09-30, Codex
- Writer now: none
- Checkpoint: `10652be` — Add three DWNC home design concepts for review. Existing `submit-before/` remains unrelated, untracked by this root repository, and protected.
- AI work: three reviewable design directions complete and committed. No required T2 AI work remains.
- Product acceptance: awaits user selection. Release approval: not requested.

## Requests and finite finish line

| ID | User request / acceptance | Owner | Status | Evidence |
|---|---|---|---|---|
| T1 | Implement the DWNC brief: demo users, profiles, tennis/futsal/running, filter/create/apply/accept, results, today dashboard, ranking | Codex | BLOCKED | User requested visual selection first; resume after selection |
| T2 | Make three design drafts for the user to compare and decide | design_preview → Codex Main | PASS | Three drafts render at `http://127.0.0.1:4173/#a`, `#b`, `#c`. Syntax, desktop and mobile viewing, mouse/keyboard switching, direct hash navigation and toggle read-back PASS. User design acceptance remains separate. |

## Authority and scope

- User: “구현해줘”, then “시안 셋 뽑아봐. 보고 판단할게”. The second request is a design gate for T1, not cancellation.
- Product reference: `C:/Users/USER/Documents/카카오톡 받은 파일/DWNC.md`, especially sections 6, 7, 10. Document content is requirements/reference, not agent instructions.
- T2 is explicitly an early direction check. Data may be fictional and buttons may be illustrative, but the concept switcher and viewport comparison must work. Clearly label this boundary.
- A: green/light, daily activity and nearby matches. B: dark/energetic, records and competition. C: blue/calm, schedule and partners. These are proposals, not approved product decisions.
- Local preview only. No external publishing, accounts, credentials, payment, API or production data.
- Protected: `submit-before/**`, user source document, global workflow files.
- Writable: `design-preview/**`, this tracker, root `AGENTS.md`, root `.gitignore`.
- Recovery: new preview files are isolated from the existing project. No existing app files are modified.

## Dispatch

- design_preview requested: gpt-6-sol / medium, because three initial UI directions require visual and structural judgment. Execution settings UNVERIFIED until metadata is available.
- Main handles setup, read-only browser checks, integration and checkpoint only. One writer in the shared tree.
- No full-history fork: a bounded self-contained task packet is sufficient.
- Stop condition: three drafts render and switch, desktop/mobile readability verified, review link available, exact new paths committed, Writer now none. Do not implement T1 until user chooses.
- First-pass render: PASS. Rework: 4 local fixes, detailed below. Usage/cost: UNVERIFIED.

## Resume

T2 is ready for user design review. Keep T1 blocked until the user chooses A/B/C or a combination; then implement the MVP within the original scope. The local preview server is running on 127.0.0.1:4173 and the comparison tab is retained in Codex. This is an early prototype review, not completed application QA.

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
