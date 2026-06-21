## Context

New project with no existing codebase. The core challenge is bridging three distinct technical domains: computer-vision-based floor plan understanding, AI-driven 3D asset generation, and real-time browser-based 3D rendering. The `image-blaster` project (https://github.com/neilsonnn/image-blaster) demonstrates the World Labs Marble (Gaussian splat) + FAL Hunyuan3D (mesh) pipeline from a single image — we adapt this pattern for per-room environments rather than fork or subprocess it.

Constraints:
- MVP must work without user accounts (session-scoped)
- 3D generation is async and slow (30s–5min per room); UI must never block on it
- Browser rendering must work on mid-range hardware without WebGPU
- All AI service calls (Claude, World Labs, FAL) are proxied through our backend to keep API keys server-side

## Goals / Non-Goals

**Goals:**
- Parse an uploaded floor plan image into a structured room list with approximate geometry
- Guide room-by-room photo uploads with correction UI
- Build a navigable procedural 3D scene from floor plan geometry (MVP)
- Generate realistic per-room 3D environments from photos via image-blaster pipeline (enhanced)
- Deliver a first-person Three.js walkthrough in the browser, progressively loading room assets
- Async generation job lifecycle with real-time progress feedback

**Non-Goals:**
- User accounts, authentication, or persistent cross-session data
- Multi-floor / multi-level homes (MVP scoped to single floor)
- Mobile-first or native app (browser-first, touch as fallback)
- Audio generation (ElevenLabs step from image-blaster is deferred to a future phase)
- Exact architectural accuracy — approximate geometry is acceptable
- Handling scanned/handwritten or very low-quality floor plans

## Decisions

### D1: Floor Plan Parsing — Claude Vision with Structured Output

**Chosen:** Send the floor plan image to Claude's vision API with a structured extraction prompt. Claude returns a JSON object describing rooms (label, bounding region in normalized 0-1 coordinates, connectivity hints, detected doors/windows per wall).

**Why over alternatives:**
- *CubiCasa API*: B2B contract required, expensive, not publicly available for new projects.
- *OpenCV contour + OCR pipeline*: Brittle across floor plan styles; requires significant tuning per architectural drawing style; room label extraction is unreliable without a strong LLM step anyway.
- *Claude Vision*: Handles arbitrary floor plan styles (hand-drawn, CAD, real estate scans); returns structured JSON via tool-use or JSON mode; confidence scores allow graceful fallback to manual review; one API call instead of a multi-step CV pipeline.

**Fallback:** If Claude's confidence is low (e.g., only 1-2 rooms detected from a complex plan), prompt user to manually draw/confirm room boundaries via a drag-box UI overlay on the floor plan image.

### D2: 3D Scene Construction — Two-Phase Procedural + AI Generation

**Phase 1 (MVP):** Construct a Three.js scene procedurally from floor plan geometry. Each room becomes an axis-aligned box primitive (extruded floor bounding rectangle). Walls are box meshes between rooms. Door openings are cut by boolean-subtracting or simply left as gaps. Room photos are projected as equirectangular or simple planar textures on inner surfaces.

**Phase 2 (Enhanced):** For each room with a photo, dispatch an async generation job to produce a Gaussian splat (.spz via World Labs Marble) and/or a mesh environment (.glb via FAL Hunyuan3D). The viewer swaps the placeholder box-room for the generated splat/mesh when ready.

**Why hybrid over pure options:**
- *Pure procedural only*: Fast and reliable but low visual fidelity — users see a white-box dollhouse.
- *Pure AI generation only*: 30s–5min per room, no browsable result until all rooms finish, generation failure leaves nothing.
- *Hybrid*: Users get a navigable walkthrough immediately from the procedural scene; realism improves room-by-room as generation completes, without blocking the experience.

### D3: image-blaster Integration — API Adaptation, Not Subprocess

**Chosen:** Extract the World Labs Marble API (Gaussian splat generation) and FAL Hunyuan3D API (mesh generation) patterns from image-blaster's source. Implement a `RoomEnvironmentService` in our Node.js backend that calls these APIs directly.

**Why not subprocess image-blaster CLI:**
- image-blaster is an interactive Claude agent — not designed for headless programmatic invocation.
- Subprocess management, stdout parsing, and error recovery would be fragile.
- We need custom async job lifecycle (queue, poll, store result) that doesn't map to a CLI workflow.

**Concrete plan:** Read image-blaster's TypeScript source to extract: World Labs API request format, FAL API request format, polling patterns, and output file handling. Wrap these into `RoomEnvironmentService.generateGaussianSplat(photoUrl)` and `RoomEnvironmentService.generateMesh(photoUrl)`.

### D4: 3D Viewer Stack — React Three Fiber + @react-three/drei

**Chosen:** `@react-three/fiber` (R3F) as the React-idiomatic Three.js renderer, with `@react-three/drei` for helpers (PointerLockControls, Environment, useGLTF, etc.).

**Why over alternatives:**
- *Raw Three.js*: More control but verbose; harder to integrate with React state for room-loading logic.
- *Babylon.js*: Heavier, game-engine focused; R3F ecosystem is better for React-native apps.
- *A-Frame*: WebXR oriented, declarative but limited for dynamic scene construction from our data model.
- *R3F*: Thin React wrapper over Three.js — no runtime overhead, full Three.js access when needed, excellent `drei` ecosystem for controls and loaders, active community.

**Gaussian splat rendering:** Use `@react-three/drei`'s `<Splat>` component (wraps three-splat) for .spz/.splat files. Falls back to GLB mesh if splat unavailable.

### D5: Navigation — Pointer-Lock First-Person + Overhead Minimap

**Chosen:** WASD + mouse pointer-lock for primary navigation (`PointerLockControls` from drei). Collision detection via Three.js `Raycaster` against wall meshes. Secondary: click-to-teleport from an overhead minimap (derived from floor plan bounds).

**Why:** First-person is the most immersive and natural for home walkthroughs. Overhead minimap provides orientation and jump-navigation without breaking the first-person framing.

### D6: Backend Architecture — Express + BullMQ + Redis

**Chosen:** Node.js/Express REST API. BullMQ (Redis-backed) for async 3D generation job queue. File uploads stored to local disk (or S3-compatible object storage). Session state persisted as JSON files alongside uploads.

**Why:**
- *Serverless functions*: Cold-start latency is acceptable for API endpoints, but job queue management (BullMQ workers) doesn't fit well in serverless without a managed queue service.
- *Express + BullMQ*: Standard, well-understood pattern for async job processing. Redis is already required by BullMQ; no additional infrastructure for MVP.
- *Session-scoped*: No auth complexity. Sessions expire after 24h.

### D7: Floor Plan Coordinate System

Floor plan parse output uses normalized `[0,1]` coordinates (origin = top-left of image). The 3D scene maps these to world units where the floor plan's longer axis = 20 Three.js units (≈ 20m for a typical house). Y axis is up; floor plan X maps to 3D X, floor plan Y maps to 3D Z (top-down view).

This decouples parsing from rendering and avoids unit confusion (mm vs ft vs m on the source drawing).

## Risks / Trade-offs

**[Risk] Claude Vision misidentifies room count or boundaries on complex floor plans** → Mitigation: confidence-gated review step forces user confirmation before photo collection begins; fallback drag-box tool lets users manually define room polygons. Additionally, prompt includes few-shot examples of common floor plan styles.

**[Risk] World Labs Marble API or FAL Hunyuan3D API unavailable, deprecated, or rate-limited** → Mitigation: generation is enhancement-only, not MVP-blocking. `RoomEnvironmentService` has a mock mode returning placeholder assets. Explicit service-interface boundary means alternative providers (Luma, Stability) can be swapped in behind the same interface.

**[Risk] Gaussian splat rendering is too slow on mid-range devices** → Mitigation: splat LOD (point-count reduction) on capability detection; automatic fallback to GLB mesh or equirectangular photo texture. Browser capability check at viewer load time sets the rendering tier.

**[Risk] Single room photo → poor 3D quality** → Mitigation: allow multiple photo uploads per room; generation service picks the best-framed photo (or composites multiple views). Set user expectations: label generated rooms as "estimated environment" not "accurate reconstruction."

**[Risk] Floor plan scale unknown or missing** → Mitigation: if dimensions are not parseable from the image, default to a plausible scale heuristic (living room ≈ 4×5m). Allow user to set a scale reference ("the kitchen is 3m wide") post-parse.

**[Risk] Long generation times frustrate users who expect immediate results** → Mitigation: procedural scene is immediately navigable; generation progress shown per-room with estimated time remaining; push via Server-Sent Events so users don't have to manually refresh.

## Migration Plan

Greenfield project — no migration required.

Deployment sequence for MVP:
1. Local development with `.env` for API keys (Claude, World Labs, FAL)
2. Docker Compose: Express + Redis (BullMQ) + static frontend build
3. One-command start: `docker compose up`

## Open Questions

- **World Labs Marble API access**: Is it publicly available or requires a waitlist/enterprise agreement? If unavailable, Phase 2 falls back to FAL-only (GLB mesh without splat).
- **Floor plan polygon vs bounding box**: Should MVP support non-rectangular room shapes (L-shaped living rooms)? Bounding boxes are sufficient for most rooms; deferring polygon support to Phase 3 is reasonable.
- **Storage**: For public demo/hosted deployment, do we need S3 or is local disk sufficient? (Local disk is fine for single-machine MVP; S3 needed for horizontal scale.)
- **Max floor plan complexity**: What's the upper bound on rooms? (Testing at 10 rooms is the target; beyond 15 rooms, generation costs and time become significant.)
