## 1. Project Setup

- [x] 1.1 Initialize monorepo with `server/` and `client/` directories and a root `package.json` with workspaces
- [x] 1.2 Set up Node.js/Express backend dependencies: `express`, `multer`, `cors`, `dotenv`, `bullmq`, `ioredis`, `@anthropic-ai/sdk`, `uuid`
- [x] 1.3 Set up Vite + React + TypeScript frontend dependencies: `three`, `@react-three/fiber`, `@react-three/drei`, `react-router-dom`, `react-dropzone`
- [x] 1.4 Install Tailwind CSS in the client and configure `tailwind.config.js` and `postcss.config.js`
- [x] 1.5 Create `.env.example` with all required variables: `ANTHROPIC_API_KEY`, `WORLD_LABS_API_KEY`, `FAL_API_KEY`, `REDIS_URL`, `PORT`, `GENERATION_MODE`, `SESSION_TTL_HOURS`
- [x] 1.6 Add Docker Compose file: Express service + Redis service; bind-mount `data/` volume for session files and uploads
- [x] 1.7 Add `dev` script running client (Vite) and server (nodemon) concurrently from the root

## 2. Session and File Upload Infrastructure (Backend)

- [x] 2.1 Create `POST /api/sessions` endpoint: generate UUID session ID, write initial `session.json` to `data/sessions/:id/`, return `{ sessionId }`
- [x] 2.2 Create `GET /api/sessions/:id` endpoint: read and return the full session JSON; return 404 if session file does not exist
- [x] 2.3 Create `SessionStore` class with `read(id)`, `write(id, data)` methods using atomic write (temp file + rename) to prevent corruption
- [x] 2.4 Configure `multer` disk storage: floor plan images → `data/sessions/:id/floor-plan/`, room photos → `data/sessions/:id/photos/:roomId/`
- [x] 2.5 Add upload validation middleware: reject MIME types other than `image/jpeg`, `image/png`, `image/webp`, `application/pdf` with HTTP 422
- [x] 2.6 Add upload size middleware: 20 MB limit for floor plan endpoint, 15 MB limit for photo endpoints; return HTTP 413 on violation

## 3. Floor Plan Parsing Service (Backend)

- [x] 3.1 Create `FloorPlanParserService` class with `parse(imagePath: string): Promise<ParseResult>` method
- [x] 3.2 Implement Claude Vision API call: encode image as base64, send with structured extraction prompt requesting rooms, normalized bounding boxes, doors, windows, dimensions, and per-room confidence scores
- [x] 3.3 Parse Claude's JSON tool-use response into the `Room[]` data model; validate required fields; set `reviewRequired: true` when overall confidence < 0.5
- [x] 3.4 Implement dimension extraction: parse unit strings (m, cm, mm, ft, in) from text in the image response; convert to meters; set `dimensionsEstimated: true` and apply default scale heuristic (total width = 12m) when no dimensions detected
- [x] 3.5 Create `POST /api/sessions/:id/floor-plan` endpoint: accept upload, set status to `processing`, call parser async, write result to session, set status to `done` or `parse_failed`
- [x] 3.6 Add error handling for Claude API failures: set `parse_failed` status with an `error` field; do not throw unhandled exceptions to the client

## 4. Room Management API (Backend)

- [x] 4.1 Add `PUT /api/sessions/:id/rooms` endpoint: replace full room list in session; validate that each room has an `id` and non-empty `label`
- [x] 4.2 Add `POST /api/sessions/:id/rooms` endpoint: create manual room with provided label and empty geometry; return the created room with generated UUID
- [x] 4.3 Add `DELETE /api/sessions/:id/rooms/:roomId` endpoint: remove room and all associated photos from session and disk
- [x] 4.4 Add `POST /api/sessions/:id/rooms/:roomId/photos` endpoint: accept photo upload, store file, append to room's `photos[]`, set as primary if it is the first photo
- [x] 4.5 Add `DELETE /api/sessions/:id/rooms/:roomId/photos/:photoId` endpoint: remove photo record from session and delete file from disk; reassign primary if deleted photo was primary
- [x] 4.6 Add `PUT /api/sessions/:id/rooms/:roomId/photos/:photoId/primary` endpoint: set the specified photo as primary for its room

## 5. Generation Job Queue (Backend)

- [x] 5.1 Initialize BullMQ connection to Redis; create `room-generation` queue with a concurrency of 2 workers
- [x] 5.2 Create `POST /api/sessions/:id/generate` endpoint: validate ≥1 room has photos; enqueue one `room-generation` job per eligible room; return initial job list with status `queued`; return HTTP 422 if no rooms have photos
- [x] 5.3 Implement `RoomEnvironmentService.generateGaussianSplat(photoUrl)`: POST photo to World Labs Marble API, poll for completion, download .spz to `data/sessions/:id/assets/:roomId/`, return local path
- [x] 5.4 Implement `RoomEnvironmentService.generateGLB(photoUrl)`: POST photo to FAL Hunyuan3D API, poll for completion with 3-retry exponential backoff (1s/2s/4s), download .glb, return local path
- [x] 5.5 Implement mock mode: when `GENERATION_MODE=mock`, `generateGaussianSplat` and `generateGLB` wait 5 seconds then return paths to pre-baked placeholder files; include `mock: true` in job record
- [x] 5.6 Create BullMQ worker: run splat step → update status `processing_splat` → run GLB step → update status `processing_glb` → set final status (`done`, `partial_done`, or `failed`); write job state to session
- [x] 5.7 Implement SSE endpoint `GET /api/sessions/:id/events`: keep connection open, push `job-update` events when worker updates job status; emit `close` event when all jobs reach terminal state
- [x] 5.8 Add `GET /api/sessions/:id/jobs` endpoint: return array of all job records (status, roomId, splatUrl, glbUrl, mock flag)

## 6. Frontend Scaffold and Routing

- [x] 6.1 Bootstrap Vite React TypeScript app in `client/`; configure path aliases (`@/` → `src/`)
- [x] 6.2 Set up React Router with four routes: `/` (LandingPage), `/session/:id/review` (FloorPlanReviewPage), `/session/:id/photos` (PhotoCollectionPage), `/session/:id/walkthrough` (WalkthroughPage)
- [x] 6.3 Create `src/api.ts` with typed fetch wrappers for all backend endpoints (createSession, uploadFloorPlan, getSession, updateRooms, addRoom, deleteRoom, uploadPhoto, setPrimaryPhoto, triggerGeneration, getJobs)
- [x] 6.4 Create `SessionContext`: holds session state, exposes update helpers, subscribes to SSE (or polling fallback) and merges job updates into state
- [x] 6.5 Wrap the app in `SessionContext.Provider`; read/write `sessionId` to `localStorage` for page-refresh persistence

## 7. Landing and Floor Plan Upload (Frontend)

- [x] 7.1 Build `LandingPage`: headline copy, react-dropzone upload zone accepting image files, "Analyze floor plan" button
- [x] 7.2 On file drop/select: call `createSession` then `uploadFloorPlan`; navigate to `/session/:id/review` after upload completes
- [x] 7.3 Show upload progress bar during file transfer using XMLHttpRequest `progress` event
- [x] 7.4 Poll `GET /api/sessions/:id` every 2s while `floorPlan.parseStatus === 'processing'`; show "Analyzing your floor plan…" spinner
- [x] 7.5 On `reviewRequired: true` parse result: display warning banner "We're not sure about all rooms — please review below" above the room list
- [x] 7.6 On `parse_failed`: show error message and offer "Try again" (re-upload) and "Enter rooms manually" (skip to review with empty list) actions

## 8. Floor Plan Review UI (Frontend)

- [x] 8.1 Build `FloorPlanReviewPage`: display uploaded floor plan image at full container width with `position: relative` container for overlay positioning
- [x] 8.2 Render a semi-transparent colored rectangle overlay for each room using its normalized bounds (`left`, `top`, `width`, `height` as percentages of image dimensions); each room gets a distinct hue
- [x] 8.3 Show room label as a chip centered in its overlay rectangle; clicking the chip enables an inline text input for renaming; on blur/enter, call `updateRooms` API
- [x] 8.4 Build `RoomListSidebar`: vertical list of all rooms with label, confidence badge (color-coded), rename input, and delete button; calls appropriate API on each action
- [x] 8.5 Add "Add room" button in sidebar: open inline input row; on submit call `addRoom` API; append new room to list with no overlay geometry
- [x] 8.6 Add "Confirm and continue" CTA at bottom of sidebar; navigate to `/session/:id/photos`

## 9. Photo Collection UI (Frontend)

- [x] 9.1 Build `PhotoCollectionPage`: render `RoomUploadRow` for each room; sort rooms with no photos to top
- [x] 9.2 Build `RoomUploadRow`: show room label, thumbnail grid of uploaded photos (click thumbnail to set as primary), "Upload photo" file button calling `uploadPhoto` API
- [x] 9.3 Add drag-and-drop support to `RoomUploadRow` using a drop zone overlay that appears on `dragenter`
- [x] 9.4 Build session progress bar at top of page: "X of Y rooms covered"; disable "Generate walkthrough" button when X = 0
- [x] 9.5 Show "Ready to generate" state (green indicator) when all rooms are covered; show "Generate anyway" secondary option when some rooms are covered but not all
- [x] 9.6 On "Generate walkthrough" click: call `triggerGeneration` API, then navigate to `/session/:id/walkthrough`

## 10. 3D Scene Builder (Frontend Utility)

- [x] 10.1 Create `src/scene/buildScene.ts` exporting `buildScene(rooms, floorPlanAspect)`: returns a `THREE.Group` containing all wall and floor meshes
- [x] 10.2 Implement coordinate mapping: compute scale factor so the longer normalized axis maps to 20 Three.js units; apply to all room bounds
- [x] 10.3 Implement room floor primitive: `PlaneGeometry` at Y=0 per room, rotated flat, sized to room world dimensions
- [x] 10.4 Implement wall construction per room: four `BoxGeometry` walls at 2.7 unit height; for walls shared with adjacent rooms and having a detected door, split the wall into two sections leaving a 0.9-unit gap at the door position
- [x] 10.5 Implement `applyRoomTexture(roomMesh, photoUrl)`: load texture with `THREE.TextureLoader`, apply to inner wall face materials; use `THREE.FrontSide` with inverted normal for inner faces
- [x] 10.6 Implement `computeSpawnPoint(rooms)`: find room with maximum area (world width × world height); return its centroid at Y=1.7
- [x] 10.7 Implement `swapRoomAsset(sceneRef, roomId, assets)`: remove all meshes with `userData.roomId === roomId`; insert loaded GLB group or Splat component at the room's world origin

## 11. Walkthrough Viewer (Frontend)

- [x] 11.1 Build `WalkthroughViewer` R3F canvas: configure `WebGLRenderer` with `antialias`; add `ambientLight` (intensity 0.4) and `directionalLight` (intensity 0.8) at a fixed position above the scene
- [x] 11.2 Mount scene group from `buildScene` in the R3F canvas; apply room photo textures to each room's wall meshes on mount
- [x] 11.3 Mount `PointerLockControls` from drei; show "Click anywhere to navigate" overlay div when pointer lock is not active; hide it when pointer lock is acquired
- [x] 11.4 Implement `usePlayerMovement` hook: track `W/A/S/D` key state; in `useFrame`, compute movement direction from camera forward/right vectors, translate camera by `speed × delta` each frame
- [x] 11.5 Implement `useWallCollision` hook: before applying movement delta in `useFrame`, cast rays in movement direction and all four cardinal directions; if any ray hits a wall mesh within 0.3 units, zero out movement on that axis
- [x] 11.6 Build `OverheadMinimap` component: 2D `<canvas>` overlay (200×200px, top-right); draw room rectangles scaled to fit; draw player dot and direction cone; update each frame via ref; add `onClick` to teleport player to clicked room centroid
- [x] 11.7 Implement device capability detection in `useRenderTier` hook: return `'high'` if `navigator.hardwareConcurrency >= 4 && devicePixelRatio >= 1.5`, else `'low'`; set `renderer.setPixelRatio(0.75)` on low tier
- [x] 11.8 Build `RoomAsset` component: conditionally render `<Splat>` (drei) on high tier or `useGLTF` mesh on low tier; fall back to procedural box if neither URL is available
- [x] 11.9 Build `RoomAssetLoader` component: connect to `SessionContext` job state; when a job transitions to a terminal state, call `swapRoomAsset` for the affected room
- [x] 11.10 Implement SSE client in `SessionContext`: open `EventSource` to `/api/sessions/:id/events`; on `error`, fall back to polling `GET /api/sessions/:id/jobs` every 10 seconds
- [x] 11.11 Build `GenerationStatusHUD`: collapsible panel (bottom-left) listing rooms with status icons (clock / spinner / checkmark / x) and room labels; toggle with a keyboard shortcut (`Tab`)

## 12. Touch and Mobile Controls (Frontend)

- [x] 12.1 Detect touch support at viewer mount (`'ontouchstart' in window || navigator.maxTouchPoints > 0`); when true, skip `PointerLockControls` and render virtual joystick overlays
- [x] 12.2 Implement left virtual joystick (bottom-left quadrant): track `touchstart`/`touchmove`/`touchend`; normalize touch delta to a movement vector; feed into `usePlayerMovement` in place of keyboard input
- [x] 12.3 Implement right swipe area (right half of screen): map `touchmove` delta to yaw/pitch rotation increments matching mouse-look sensitivity

## 13. Integration and Validation

- [x] 13.1 Write integration test (Jest + supertest): `POST /api/sessions` → `POST /api/sessions/:id/floor-plan` with a sample floor plan PNG → assert response contains ≥1 room with non-empty label and valid bounds
- [x] 13.2 Write integration test: `POST .../rooms/:roomId/photos` with a JPEG → assert room's `photos` array has length 1 and `primaryPhotoId` is set
- [x] 13.3 Write integration test (mock mode, `GENERATION_MODE=mock`): trigger generation → poll `GET .../jobs` every 1s until all jobs reach `done` → assert `splatUrl` or `glbUrl` present on each job; assert completes within 15s
- [ ] 13.4 Manual smoke test — full happy path on Chrome desktop: upload floor plan → review rooms → upload one photo per room → generate → navigate walkthrough with WASD and mouse
- [ ] 13.5 Manual test — minimap teleport: click each room in minimap and verify player relocates inside the correct room
- [ ] 13.6 Manual test — collision detection: walk into every wall and verify the player cannot pass through; walk through every door gap and verify passage is unobstructed
- [ ] 13.7 Manual test — touch controls: open viewer in Chrome DevTools mobile emulation; verify left joystick moves player and right swipe rotates camera
- [ ] 13.8 Verify end-to-end flow with `GENERATION_MODE=mock` and no external API keys set; confirm all screens function and viewer receives and swaps in placeholder assets
