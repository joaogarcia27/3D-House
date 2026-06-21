## ADDED Requirements

### Requirement: Render a first-person 3D view of the assembled scene
The system SHALL render the assembled 3D scene (procedural geometry + any generated assets) in a full-viewport Three.js canvas using React Three Fiber. The default camera SHALL be positioned at the player spawn point (centroid of largest room, Y=1.7 units) with a 75° vertical field of view.

#### Scenario: Viewer loads with floor plan data
- **WHEN** the user navigates to the walkthrough view with a session containing at least one room
- **THEN** a full-screen 3D canvas is rendered showing the interior of the spawn room with visible walls and floor

#### Scenario: Viewer loads with no rooms
- **WHEN** the session has no rooms defined
- **THEN** a centered error message "No rooms to display — please complete the floor plan setup" is shown instead of the 3D canvas

---

### Requirement: Support first-person WASD + mouse navigation with pointer lock
The system SHALL implement pointer-lock-based mouse-look navigation. Once the user clicks the canvas, the browser pointer lock API SHALL be engaged. Mouse movement SHALL rotate the camera (yaw and pitch). WASD keys SHALL translate the player (W=forward, S=backward, A=strafe left, D=strafe right) relative to the current look direction. Movement speed SHALL be 3 units/second.

#### Scenario: User clicks canvas and navigates
- **WHEN** the user clicks the 3D canvas and moves the mouse
- **THEN** the camera rotates following mouse delta; pressing W moves the camera forward in the look direction

#### Scenario: Pointer lock exited via Escape
- **WHEN** the user presses Escape while pointer lock is active
- **THEN** pointer lock is released; a "Click to resume navigation" overlay is shown on the canvas

---

### Requirement: Enforce collision detection against wall meshes
The system SHALL prevent the player camera from passing through wall meshes. Collision detection SHALL use Three.js `Raycaster` casting rays in the movement direction and the four cardinal directions from the camera position. If a wall is detected within a minimum clearance distance of 0.3 units, movement in that direction SHALL be blocked.

#### Scenario: Player walks toward a wall
- **WHEN** the player moves forward and the front-facing ray detects a wall within 0.3 units
- **THEN** forward movement stops; the player can still strafe or turn

#### Scenario: Player moves through a door opening
- **WHEN** the player approaches a door gap in a wall
- **THEN** movement through the gap is unobstructed (no ray intersection with the wall at that position)

---

### Requirement: Display overhead minimap for orientation and teleport
The system SHALL render a 2D overhead minimap overlay (top-right corner, 200×200px) derived from the floor plan geometry. Rooms are shown as labeled rectangles; the player position and look direction are shown as a dot with a direction indicator. Clicking a room on the minimap SHALL teleport the player to the centroid of that room at eye height.

#### Scenario: Minimap shows player position
- **WHEN** the player moves through the scene
- **THEN** the minimap dot updates in real-time to reflect the player's current position relative to the floor plan bounds

#### Scenario: User clicks a room on the minimap
- **WHEN** the user clicks the "Kitchen" rectangle on the minimap
- **THEN** the player camera instantly repositions to the Kitchen room centroid at Y=1.7 without animation

---

### Requirement: Progressive asset loading — show placeholder while generating
The system SHALL subscribe to the session's SSE event stream. While a room's generated assets are pending, the room SHALL display its procedural box primitive with photo texture (or neutral color). When a terminal job event arrives for a room, the viewer SHALL dynamically load and swap in the generated GLB or splat asset without requiring a page reload.

#### Scenario: Room generation completes while user is in the walkthrough
- **WHEN** a room's generation job transitions to `done` and the viewer receives the SSE event
- **THEN** the placeholder box primitive for that room is replaced by the generated GLB or splat within 3 seconds of the event arriving, while the user is still navigating

#### Scenario: Connection to SSE lost
- **WHEN** the SSE stream disconnects
- **THEN** the viewer falls back to polling `GET /api/sessions/:id/jobs` every 10 seconds; no error is shown to the user

---

### Requirement: Adapt rendering tier to device capability
The system SHALL detect device capability at viewer load time. If `navigator.gpu` (WebGPU) is unavailable or the device is classified as low-end (based on hardware concurrency < 4 or devicePixelRatio < 1.5), the system SHALL use Three.js WebGLRenderer with reduced pixel ratio (0.75) and SHALL skip Gaussian splat rendering (falling back to GLB mesh only). On capable devices, splat rendering SHALL be attempted first.

#### Scenario: High-end device — splat rendered
- **WHEN** the viewer loads on a device with hardware concurrency ≥ 4 and a generated .spz asset is available
- **THEN** the Splat component loads the .spz file for that room

#### Scenario: Low-end device — splat skipped, GLB used
- **WHEN** the viewer loads on a device with hardware concurrency < 4
- **THEN** splat rendering is skipped; the viewer uses GLB mesh (or procedural box if GLB is unavailable); pixel ratio is clamped to 0.75

---

### Requirement: Support touch controls as fallback for mobile
The system SHALL detect touch input support and replace pointer-lock navigation with on-screen joystick controls: a left virtual joystick for movement (WASD) and a right swipe area for camera rotation. Touch navigation SHALL target the same movement speed as keyboard navigation.

#### Scenario: Mobile device opens the viewer
- **WHEN** the viewer is loaded on a device with touch events and no pointer lock support
- **THEN** two virtual joystick overlays are rendered; dragging the left joystick moves the player and dragging the right area rotates the camera
