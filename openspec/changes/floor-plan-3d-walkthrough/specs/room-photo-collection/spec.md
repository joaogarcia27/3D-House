## ADDED Requirements

### Requirement: Display photo upload checklist derived from parsed rooms
The system SHALL render a per-room upload checklist immediately after a successful floor plan parse, listing every detected room by label. Each room entry SHALL display its current upload status (no photos / photos uploaded / generation complete) and a call-to-action to upload photos.

#### Scenario: Checklist rendered after successful parse
- **WHEN** the floor plan parse returns at least one room
- **THEN** the UI displays a list where each detected room has a distinct row with its label and an "Upload photo" button

#### Scenario: Empty parse result handled gracefully
- **WHEN** the floor plan parse returns zero rooms
- **THEN** the checklist displays a prompt to add rooms manually rather than an empty list

---

### Requirement: Accept multiple photo uploads per room
The system SHALL allow the user to upload one or more photos for each room. Photos SHALL be JPEG, PNG, or WebP, up to 15 MB each, with a maximum of 10 photos per room. Each upload SHALL be stored and associated with its room ID. The most recently uploaded photo SHALL be designated as the primary photo used for generation unless the user selects a different one.

#### Scenario: Single photo uploaded for a room
- **WHEN** a user uploads one photo for "Bedroom 1"
- **THEN** the room status changes from "no photos" to "photos uploaded" and the photo thumbnail is shown in the checklist row

#### Scenario: Multiple photos uploaded; primary selected
- **WHEN** a user uploads three photos for "Kitchen"
- **THEN** all three thumbnails are displayed and the user can tap one to mark it as primary for 3D generation

#### Scenario: Photo exceeds size limit
- **WHEN** a user attempts to upload a photo larger than 15 MB
- **THEN** the upload is rejected with an error message before any data is transferred to the server

---

### Requirement: Allow room label correction
The system SHALL allow the user to rename any room label at any point during the photo collection phase. Renaming a room SHALL update the label in the checklist, in the 3D scene, and in any pending generation jobs.

#### Scenario: User renames a room
- **WHEN** a user clicks the edit icon next to "Room 1" and types "Home Office"
- **THEN** the room is displayed as "Home Office" throughout the app immediately

---

### Requirement: Allow manual room addition
The system SHALL provide an "Add room" control that lets the user define a new room not detected by the parser. The user SHALL provide a label; geometry defaults to an unpositioned placeholder (no bounds set) and the room is added to the checklist.

#### Scenario: User adds a room manually
- **WHEN** a user clicks "Add room" and types "Utility Room"
- **THEN** a new row labeled "Utility Room" appears in the checklist with no-photo status and an upload button

---

### Requirement: Track overall upload progress
The system SHALL display a session-level progress indicator showing how many rooms have at least one photo uploaded versus the total number of rooms. It SHALL surface a clear "Ready to generate" state when all rooms have at least one photo, and a "Generate anyway" option when at least one room has photos but some do not.

#### Scenario: All rooms have photos
- **WHEN** every room in the checklist has at least one uploaded photo
- **THEN** the progress indicator reads "All rooms covered" and a prominent "Generate walkthrough" button is enabled

#### Scenario: Some rooms missing photos
- **WHEN** at least one room has photos but at least one room has none
- **THEN** the UI shows "X of Y rooms covered" and offers both "Continue uploading" and "Generate anyway (skip missing rooms)"

#### Scenario: No rooms have photos
- **WHEN** no photos have been uploaded to any room
- **THEN** the "Generate walkthrough" and "Generate anyway" buttons are disabled
