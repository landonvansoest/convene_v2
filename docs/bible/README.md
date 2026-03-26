# Convene Bible (source of truth)

**Canonical product + schema contract:** `convene_bible_032526.rtf` in this folder.

## How to use it

- Treat **rev3** as the authority for v2 behavior, UI contracts, and database fields.
- When implementing, prefer a **plain-text export** for diffing and search (macOS: `textutil -convert txt -stdout docs/bible/convene_bible_032526.rtf`).
- **Suggested edits** with RTF locate hints and line anchors: `docs/bible/BIBLE_REV3_CUT_PASTE_PATCHES.md`.
- **v2 Next.js app (Bible stack):** `apps/web` — run `npm run dev:web` from repo root.
- **`V1_to_V2_DB_MAPPING.md`** (repo root) is only for **optional one-time data migration** from v1; it must stay aligned with whatever Bible revision you adopt (update its header if the filename/version changes).

## Why this location

- **`docs/bible/`** keeps the contract versioned with the code, discoverable for humans and AI, and separate from throwaway notes in repo root (`BIBLE_*.md` patches can remain as working notes until merged into the next Bible revision).
