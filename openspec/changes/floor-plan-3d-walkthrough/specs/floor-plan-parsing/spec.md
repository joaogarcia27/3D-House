## ADDED Requirements

### Requirement: Accept and validate floor plan image upload
The system SHALL accept image file uploads (JPEG, PNG, PDF page 1, WebP) up to 20 MB for floor plan parsing. It SHALL reject unsupported formats and oversized files with a descriptive error message before sending anything to the AI service.

#### Scenario: Valid image uploaded
- **WHEN** a user uploads a JPEG or PNG file under 20 MB
- **THEN** the system accepts the file, stores it server-side, and returns a session ID with a `processing` status

#### Scenario: Unsupported file type rejected
- **WHEN** a user uploads a file with an unsupported extension (e.g., .docx, .mp4)
- **THEN** the system returns HTTP 422 with an error explaining the accepted formats before any AI call is made

#### Scenario: File too large rejected
- **WHEN** a user uploads a file exceeding 20 MB
- **THEN** the system returns HTTP 413 with an error before any AI call is made

---

### Requirement: Extract room list via AI vision parsing
The system SHALL send the uploaded floor plan image to the Claude Vision API with a structured extraction prompt. It SHALL return a JSON array of detected rooms, each with a label, normalized bounding rectangle (`x`, `y`, `width`, `height` in [0,1] relative to image dimensions), a confidence score (0–1), and a list of detected adjacencies (neighboring room labels).

#### Scenario: Well-formed floor plan parsed successfully
- **WHEN** the uploaded floor plan clearly shows labeled rooms with legible text
- **THEN** the parser returns at least one room entry with a non-empty label and a confidence score ≥ 0.7

#### Scenario: Low-confidence parse result flagged for review
- **WHEN** the overall parse confidence falls below 0.5 (e.g., unlabeled schematic, very small image)
- **THEN** the response includes a `reviewRequired: true` flag and the room list, prompting the user to manually verify before proceeding

#### Scenario: Parsing fails entirely
- **WHEN** the Claude API returns an error or cannot identify any rooms
- **THEN** the session status is set to `parse_failed` and the user is presented with the option to retry or define rooms manually

---

### Requirement: Extract approximate dimensions from floor plan
The system SHALL attempt to parse dimension annotations (numeric labels with unit indicators such as "3.5m", "12ft", "350cm") from the floor plan image. When dimensions are detected, it SHALL associate them with the nearest room and normalize to meters. When dimensions are absent or ambiguous, it SHALL apply a default scale heuristic (total floor plan width = 12m) and flag the result as estimated.

#### Scenario: Dimension annotations present and parsed
- **WHEN** the floor plan includes readable dimension labels such as "4500" or "14.8 ft"
- **THEN** the parser returns rooms with a `widthM` and `heightM` field reflecting the parsed and normalized values

#### Scenario: No dimension annotations detected
- **WHEN** the floor plan contains no readable dimension text
- **THEN** rooms are returned with estimated dimensions based on the default scale heuristic, and a `dimensionsEstimated: true` flag is set on the response

---

### Requirement: Surface detection of doors and windows
The system SHALL attempt to identify door openings (arc symbols, gap in wall line) and window positions (parallel lines on wall) in the floor plan and associate them with the room wall on which they appear. Detected doors and windows SHALL be returned as part of each room's data for use in 3D wall construction.

#### Scenario: Door detected between two rooms
- **WHEN** the floor plan shows a standard door arc symbol between two labeled rooms
- **THEN** both room entries include a `doors` array with at least one entry indicating the connecting room label and approximate wall position (normalized 0-1 along that wall)

#### Scenario: No door or window symbols detected
- **WHEN** the floor plan uses non-standard notation or the symbols are too small to parse
- **THEN** the rooms are returned with empty `doors` and `windows` arrays; no error is raised
