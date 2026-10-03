# DWNC project map

- Shared tracker and write ownership: `CURRENT-STATE.md`. Read before writing and maintain one writer.
- Product reference: `C:/Users/USER/Documents/카카오톡 받은 파일/DWNC.md`; latest user decisions override reference material.
- `design-preview/` contains local visual direction drafts. It is not the finished sports platform.
- User chose draft A; functional local MVP lives in `dwnc-app/`. Preserve the prior design drafts.
- `submit-before/` is a separate existing project. Do not edit, stage, inspect credentials, or include it in DWNC commits.
- Do not publish or connect real accounts/data without user approval. Local fictional demos are allowed.
- Preview commands and relevant checks belong in `design-preview/README.md`.
- Application run/test commands belong in root `README.md` and `package.json`. T11 adds real local Better Auth sessions and SQLite persistence; see `HANDOFF.md`. This does not authorize production accounts, external databases or deployment. Historical demo switching/storage remains on `main`.
- Verify concept navigation and responsive rendering in the real browser before handing drafts to the user. User selection is the visual acceptance gate.
