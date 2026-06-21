## ADDED Requirements

### Requirement: Queue a generation job per room with a photo
The system SHALL accept a "generate" trigger for a session and SHALL enqueue one async generation job per room that has at least one uploaded photo. Rooms without photos SHALL be skipped (no job created, no error). Each job SHALL record its room ID, primary photo URL, and initial status of `queued`.

#### Scenario: Session with three rooms, two having photos
- **WHEN** the user triggers generation for a session where two of three rooms have photos
- **THEN** exactly two jobs are enqueued; the third room remains with status `skipped`; the response includes a job list with IDs for the two enqueued jobs

#### Scenario: Generation triggered with no photos uploaded
- **WHEN** the user triggers generation and no room has any uploaded photo
- **THEN** the system returns HTTP 422 with an error and no jobs are created

---

### Requirement: Execute Gaussian splat generation via World Labs Marble
For each queued job, the system SHALL call the World Labs Marble API with the primary room photo as input. It SHALL poll the Marble API until the job is complete or has failed, then download and store the resulting `.spz` file. The job status SHALL progress: `queued` → `processing_splat` → (`splat_done` | `splat_failed`).

#### Scenario: Marble API returns successful splat
- **WHEN** the World Labs Marble API returns a completed job with a `.spz` download URL
- **THEN** the system downloads the file, stores it, and updates the job status to `splat_done` with the internal asset URL

#### Scenario: Marble API returns a failure
- **WHEN** the World Labs Marble API returns an error status for the job
- **THEN** the system updates the job status to `splat_failed`, logs the error, and continues to the GLB mesh generation step (if applicable) rather than failing the entire job

#### Scenario: World Labs Marble API unavailable
- **WHEN** the Marble API endpoint is unreachable or returns HTTP 5xx
- **THEN** the splat step is marked as `splat_skipped` and generation continues to the GLB step; no unhandled exception propagates

---

### Requirement: Execute GLB mesh generation via FAL Hunyuan3D
For each job, after the splat step (or if splat is skipped/failed), the system SHALL call the FAL Hunyuan3D API with the primary room photo. It SHALL poll until complete or failed, then download and store the `.glb` file. Status progresses to `processing_glb` → (`glb_done` | `glb_failed`).

#### Scenario: FAL Hunyuan3D returns successful mesh
- **WHEN** the FAL API returns a completed job with a `.glb` download URL
- **THEN** the system downloads the file, stores it, and updates the job to `glb_done` with the internal asset URL

#### Scenario: FAL API fails after retries
- **WHEN** the FAL API returns errors on all retry attempts (up to 3 with exponential backoff)
- **THEN** the step is marked `glb_failed`; if at least the splat succeeded, the overall job is marked `partial_done`; otherwise `failed`

---

### Requirement: Report overall job completion status
A generation job is considered `done` when both splat and GLB steps have either succeeded or been skipped/failed gracefully. The job record SHALL include asset URLs for every successfully generated asset. The system SHALL emit a Server-Sent Event (SSE) on the session's event stream when any job transitions to a terminal state (`done`, `partial_done`, or `failed`).

#### Scenario: Both steps succeed
- **WHEN** both the Marble splat and FAL GLB steps complete successfully
- **THEN** the job status is `done`, both `splatUrl` and `glbUrl` are present, and an SSE event is emitted for the session

#### Scenario: Splat fails but GLB succeeds
- **WHEN** the Marble step fails and the FAL step succeeds
- **THEN** the job status is `partial_done`, only `glbUrl` is present, and an SSE event is emitted

---

### Requirement: Expose job status polling endpoint
The system SHALL expose a `GET /api/sessions/:id/jobs` endpoint returning the current status of all generation jobs for a session, including job ID, room ID, status, and any available asset URLs. This endpoint SHALL be usable both for SSE fallback polling and for initial page-load hydration.

#### Scenario: Client polls for job status
- **WHEN** the client sends `GET /api/sessions/:id/jobs`
- **THEN** the response is a JSON array of all jobs with current `status`, `roomId`, and any asset URLs; HTTP 200

#### Scenario: No jobs exist yet
- **WHEN** generation has not been triggered for the session
- **THEN** `GET /api/sessions/:id/jobs` returns an empty array; HTTP 200

---

### Requirement: Provide a mock/stub mode for development
The system SHALL support an environment variable `GENERATION_MODE=mock` that causes the `RoomEnvironmentService` to return pre-baked placeholder `.spz` and `.glb` files after a configurable delay (default 5s), bypassing all external API calls. This mode SHALL be detectable in the response with a `mock: true` field on each job.

#### Scenario: Mock mode enabled
- **WHEN** `GENERATION_MODE=mock` is set and generation is triggered
- **THEN** all jobs complete within the configured delay with placeholder asset URLs and `mock: true` in the job record; no external APIs are called
