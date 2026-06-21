## Why

Creating interactive 3D walkthroughs of homes today requires expensive equipment (Matterport cameras, LiDAR), specialized software, or professional services — putting it out of reach for most homeowners, agents, and architects. Architectural floor plans already encode the spatial structure of a home, and room photos are trivially available; this app bridges that gap to produce a browser-based first-person walkthrough from assets anyone already has.

## What Changes

- New web application (no existing codebase)
- Upload and AI-parse an architectural floor plan image to extract rooms, walls, doors, windows, and approximate dimensions
- Guided, room-by-room photo upload workflow with progress tracking, room name correction, and manual room addition
- Procedural 3D scene construction from parsed floor plan geometry (wall meshes, door openings, room bounding volumes)
- Room photo → 3D environment pipeline adapted from `image-blaster` (World Labs Marble / FAL Hunyuan3D / Gaussian splats) to generate realistic per-room assets
- Browser-based first-person walkthrough viewer using Three.js with pointer-lock navigation
- Phased delivery: MVP ships navigable geometry with flat textures; later phases layer in photo-derived textures and AI-generated 3D assets

## Capabilities

### New Capabilities

- `floor-plan-parsing`: Accept an uploaded architectural floor plan image; use a multimodal AI model (Claude Vision) to detect and return a structured room list with approximate geometry (bounding polygons, wall locations, door/window positions, room labels and dimensions). Includes a correction UI for user validation.
- `room-photo-collection`: Track required room photos against the detected room list; guide the user through uploading one or more photos per room; allow manual room additions and label edits; surface upload progress and missing rooms.
- `3d-scene-assembly`: Consume parsed floor plan geometry to construct a navigable 3D scene — walls extruded from the floor plan polygon, door openings cut, rooms laid out to scale. Output a Three.js scene graph.
- `room-environment-generation`: For each room with at least one photo, invoke the image-blaster pipeline (World Labs Marble for Gaussian splats, FAL Hunyuan3D for mesh assets) to generate a realistic 3D room environment. Manages async job lifecycle, polling, and result storage.
- `walkthrough-viewer`: Browser-based first-person viewer built on Three.js with pointer-lock controls, collision detection against wall meshes, room-transition loading, and mobile touch fallback. Loads room environments progressively as generation completes.

### Modified Capabilities

<!-- No existing capabilities — this is a new project -->

## Impact

- **New project**: no existing code is affected
- **External service dependencies**:
  - Claude API (Anthropic) — floor plan image parsing via vision
  - World Labs Marble API — Gaussian splat generation per room photo
  - FAL.ai — Hunyuan3D mesh generation per room photo
  - (Optional) ElevenLabs — ambient audio per room (image-blaster pattern)
- **Frontend**: React + Three.js + `@react-three/fiber`; no existing UI to migrate
- **Backend**: Node.js/Express API layer to proxy AI service calls, manage session/job state, and serve generated assets; alternatively a serverless approach (Vercel/Netlify functions) for MVP
- **Data**: Session-scoped (no user accounts in MVP); floor plan parse results and generation job state held server-side with optional local persistence
- **Performance**: 3D generation jobs are long-running (30s–5min per room); must be async with polling or websocket progress updates; viewer must lazy-load room assets
