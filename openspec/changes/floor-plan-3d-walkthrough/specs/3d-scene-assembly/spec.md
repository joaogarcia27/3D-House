## ADDED Requirements

### Requirement: Build procedural 3D scene from floor plan geometry
The system SHALL construct a Three.js scene graph from the parsed floor plan room list. Each room SHALL be represented as an axis-aligned box primitive whose floor dimensions correspond to the room's normalized bounding rectangle mapped to world units. All rooms SHALL share a common floor plane (Y=0). Wall height SHALL default to 2.7 Three.js units (representing 2.7m).

#### Scenario: Two-room floor plan produces two box primitives
- **WHEN** the parsed floor plan contains two rooms ("Living Room" and "Kitchen") with non-overlapping bounding rectangles
- **THEN** the assembled scene contains two distinct box meshes at the correct relative positions and sizes on the Y=0 plane

#### Scenario: Single-room floor plan still produces a navigable scene
- **WHEN** only one room is detected or defined
- **THEN** the scene contains one box primitive with default dimensions (5×5 units) and the viewer spawns inside it

---

### Requirement: Apply coordinate scaling to world units
The system SHALL map normalized floor plan coordinates [0,1] to Three.js world units such that the longer floor plan axis equals 20 units. The shorter axis scales proportionally. This mapping SHALL be computed once at scene-build time and reused by all room geometry, door placement, and navigation spawn-point calculations.

#### Scenario: Floor plan wider than tall
- **WHEN** the floor plan image is 2000×1200 pixels and contains rooms filling the full extent
- **THEN** the 3D scene's X extent is 20 units and Z extent is 12 units

---

### Requirement: Cut door openings in shared walls
The system SHALL represent door connections between adjacent rooms as gap openings in the shared wall mesh. When a door is detected between two rooms, the wall segment at that position SHALL be split into two wall sections with a 0.9-unit gap (representing a standard 90cm door width) at the detected position along the wall.

#### Scenario: Door between Living Room and Hallway produces wall gap
- **WHEN** the parsed floor plan includes a door between "Living Room" and "Hallway"
- **THEN** the shared wall between those rooms has a navigable gap of 0.9 units at the detected door position

#### Scenario: No door detected — solid wall rendered
- **WHEN** no door is detected between two adjacent rooms
- **THEN** a solid wall mesh is rendered between them with no gap

---

### Requirement: Apply room photo as flat surface texture in MVP
In Phase 1, the system SHALL project the primary room photo as a texture on the inner surfaces of the room's box primitive (at minimum the back and side walls). The texture SHALL be stretched to cover the available wall area with aspect-ratio-corrected UV mapping.

#### Scenario: Room with primary photo gets textured walls
- **WHEN** a room has at least one uploaded photo designated as primary
- **THEN** the inner wall surfaces of that room's box primitive display the photo as a flat texture in the Three.js scene

#### Scenario: Room without a photo gets a placeholder material
- **WHEN** a room has no uploaded photos
- **THEN** the box primitive is rendered with a flat neutral color material (light gray) and a centered room label text sprite

---

### Requirement: Swap placeholder geometry for generated 3D assets
When a room's AI-generated assets (GLB mesh or Gaussian splat) become available, the system SHALL remove the placeholder box primitive for that room and insert the generated asset into the scene at the same floor-plan-derived position and scale.

#### Scenario: GLB asset available for a room
- **WHEN** the room environment generation job completes and returns a .glb URL
- **THEN** the viewer loads the GLB via useGLTF, positions it at the room's world origin, and removes the box primitive

#### Scenario: Gaussian splat available for a room
- **WHEN** the room environment generation job completes and returns a .spz URL
- **THEN** the viewer loads the splat via the drei Splat component, positions it at the room's world origin, and removes the box primitive

---

### Requirement: Compute player spawn point
The system SHALL compute an initial player spawn position at the centroid of the largest room (by area) in the scene, at eye height (Y = 1.7 units). If no room geometry is available, the spawn point SHALL default to the origin (0, 1.7, 0).

#### Scenario: Largest room identified as spawn room
- **WHEN** the floor plan has three rooms of differing sizes
- **THEN** the player spawns inside the room with the largest floor area at Y=1.7
