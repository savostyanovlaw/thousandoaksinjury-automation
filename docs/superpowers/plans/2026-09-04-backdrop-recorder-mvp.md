# Backdrop Recorder MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Samsung Galaxy A23-friendly Android MVP that records the user composited over a selected photo background and saves the result locally as MP4.

**Architecture:** Native Kotlin app under `apps/backdrop-recorder/`. CameraX handles camera lifecycle and analysis frames; local person segmentation produces a mask; a GPU renderer composites person + selected background; MediaCodec/MediaMuxer records the rendered output with microphone audio; MediaStore saves the result.

**Tech Stack:** Kotlin, Android SDK, CameraX, on-device person segmentation, OpenGL ES or equivalent GPU-backed rendering, MediaCodec, MediaMuxer, MediaStore, Jetpack Compose or standard Android UI.

**Spec:** `docs/superpowers/specs/2026-09-04-backdrop-recorder-design.md`

## Global Constraints
- All Android application code must live in `apps/backdrop-recorder/`.
- Do not modify production website behavior.
- MVP is offline-only; no backend, login, analytics SDK, or cloud processing.
- Optimize for Samsung Galaxy A23-class hardware and approximately 4 GB RAM.
- Primary format: portrait 9:16.
- Target: 1080x1920 30 fps H.264 + AAC, with automatic 720x1280 30 fps fallback when sustained performance is inadequate.
- UI overlays must never be encoded into the saved video.
- All implementation work must use feature branches and PRs into `main`; never push app code directly to `main`.

---

### Task 1: Android project shell and buildable APK

**Files:**
- Create: `apps/backdrop-recorder/settings.gradle.kts`
- Create: `apps/backdrop-recorder/build.gradle.kts`
- Create: `apps/backdrop-recorder/app/build.gradle.kts`
- Create: `apps/backdrop-recorder/app/src/main/AndroidManifest.xml`
- Create: `apps/backdrop-recorder/app/src/main/java/com/savostyanovlaw/backdroprecorder/MainActivity.kt`
- Create: `apps/backdrop-recorder/README.md`
- Create: minimal unit/instrumentation test setup under `apps/backdrop-recorder/app/src/test/` and `app/src/androidTest/`

**Interfaces:**
- Produces: a Gradle Android app that builds a debug APK and launches to a simple `New Recording` home screen.

- [ ] Create the isolated Android project under `apps/backdrop-recorder/` with package `com.savostyanovlaw.backdroprecorder`.
- [ ] Configure compile/target SDK and minimum SDK compatible with current CameraX while remaining usable on Galaxy A23-era Android versions.
- [ ] Add only the dependencies needed for the shell and tests.
- [ ] Add a simple launch screen with `New Recording` and no network-dependent behavior.
- [ ] Add a test that verifies the app package and launch activity are configured.
- [ ] Run the Gradle test suite and `assembleDebug`; both must pass.
- [ ] Open a PR named `Backdrop Recorder: Android project shell` and stop for review. Do not merge.

### Task 2: Front-camera preview

**Files:**
- Create focused camera classes under `apps/backdrop-recorder/app/src/main/java/com/savostyanovlaw/backdroprecorder/camera/`
- Update recorder screen UI only as needed.
- Add camera lifecycle tests where practical.

**Interfaces:**
- Produces: `CameraController` that exposes front-camera preview frames and lifecycle-safe start/stop behavior.

- [ ] Add camera and microphone permissions with user-friendly denial handling.
- [ ] Use CameraX with the front camera and portrait preview.
- [ ] Ensure camera resources stop on lifecycle pause/exit.
- [ ] Add instrumentation coverage for permission-state UI and camera screen navigation where device/emulator support permits.
- [ ] Run tests and build debug APK.
- [ ] Open a separate PR and stop for review.

### Task 3: Background picker and local background repository

**Files:**
- Create `media/BackgroundRepository.kt`
- Create background picker UI/state files.
- Add tests for accepted/rejected media metadata and persistence of the selected background reference.

**Interfaces:**
- Produces: a background selected through Android Photo Picker and normalized for portrait rendering without modifying the original user photo.

- [ ] Add Photo Picker flow for JPG/PNG images.
- [ ] Normalize selected background for 9:16 rendering, preserving enough source data for crop/position adjustments.
- [ ] Cache app-local working representation; do not overwrite user media.
- [ ] Add failure UI for unreadable/unsupported images.
- [ ] Run tests and build debug APK.
- [ ] Open a separate PR and stop for review.

### Task 4: On-device person segmentation prototype

**Files:**
- Create `segmentation/PersonSegmenter.kt`
- Create `segmentation/MaskProcessor.kt`
- Create segmentation diagnostics/test helpers.

**Interfaces:**
- Consumes: camera analysis frames.
- Produces: timestamped person masks at reduced analysis resolution.

- [ ] Integrate an on-device person/background segmentation solution suitable for live-stream use.
- [ ] Downscale analysis frames before inference.
- [ ] Configure backpressure so analysis frames are dropped rather than queued when segmentation is busy.
- [ ] Reuse the latest valid mask between inference results.
- [ ] Add light spatial and temporal smoothing with bounded latency.
- [ ] Add unit tests for mask smoothing/state handling independent of the camera.
- [ ] Add a debug-only mask visualization so the result can be verified on a physical A23.
- [ ] Run tests and build debug APK.
- [ ] Open a separate PR and stop for review.

### Task 5: Real-time composited preview

**Files:**
- Create `renderer/VideoRenderer.kt`
- Create `renderer/BackgroundRenderer.kt`
- Create shader/resources required for person/background composition.
- Update recorder UI to display the rendered output.

**Interfaces:**
- Consumes: camera texture/frame, latest person mask, selected background.
- Produces: one rendered portrait video surface used for preview and later recording.

- [ ] Implement GPU-backed composition of camera image + person mask + selected background.
- [ ] Keep UI controls, timer, guides, and countdown outside the video render surface.
- [ ] Correct front-camera mirroring consistently between preview and intended saved output.
- [ ] Add background fit/crop behavior with sensible portrait defaults.
- [ ] Validate no unbounded bitmap allocation occurs per frame.
- [ ] Build debug APK and verify on physical device that preview remains interactive.
- [ ] Open a separate PR and stop for review.

### Task 6: Performance guardrails for Galaxy A23

**Files:**
- Create `diagnostics/PerformanceMonitor.kt`
- Add adaptive segmentation/preview configuration code.
- Add unit tests for degradation thresholds/state transitions.

**Interfaces:**
- Produces: rolling metrics for render FPS, segmentation cadence, dropped frames, and encoder latency; exposes adaptive quality decisions.

- [ ] Track render cadence, segmentation cadence, dropped analysis frames, and frame-processing latency.
- [ ] Reduce segmentation frequency/resolution before lowering output resolution.
- [ ] Define a deterministic fallback from 1080x1920 to 720x1280 when sustained performance cannot meet stable recording needs.
- [ ] Keep adaptation bounded to avoid rapid oscillation between quality levels.
- [ ] Run unit tests and physical-device smoke test.
- [ ] Open a separate PR and stop for review.

### Task 7: Composite video recording

**Files:**
- Create `recording/VideoEncoder.kt`
- Create `recording/RecordingController.kt`
- Extend renderer so the same composed frames feed encoder input surface.
- Add tests for recording state transitions and timestamp monotonicity.

**Interfaces:**
- Consumes: rendered composite frames.
- Produces: H.264 video elementary stream with monotonic timestamps.

- [ ] Use MediaCodec H.264 encoder with an input surface fed from the composited render pipeline.
- [ ] Target 1080x1920 30 fps when performance allows; use 720x1280 fallback from Task 6.
- [ ] Implement start/stop/failure state machine that always releases codecs and surfaces.
- [ ] Ensure preview continues while recording.
- [ ] Add 3-2-1 UI countdown before encoder start; countdown must not be part of encoded surface.
- [ ] Run tests and create a silent-video smoke recording on a physical device.
- [ ] Open a separate PR and stop for review.

### Task 8: Microphone audio and MP4 muxing

**Files:**
- Create `recording/AudioEncoder.kt`
- Create `recording/Mp4Muxer.kt`
- Update `RecordingController.kt`
- Add timestamp/A-V state tests.

**Interfaces:**
- Consumes: microphone PCM/audio input and H.264 stream.
- Produces: finalized MP4 with H.264 video + AAC audio.

- [ ] Capture microphone audio locally and encode AAC.
- [ ] Mux video and audio into MP4 using MediaMuxer.
- [ ] Use monotonic timestamps and explicit start alignment so audio/video remain acceptably synchronized across 1-5 minute recordings.
- [ ] Gracefully handle microphone permission denial and recording interruption.
- [ ] Verify a physical-device recording plays with synchronized audio.
- [ ] Open a separate PR and stop for review.

### Task 9: Preview, retake, save, and share

**Files:**
- Create preview screen/state files.
- Create `media/GalleryRepository.kt`
- Add navigation and save/share tests.

**Interfaces:**
- Consumes: finalized temporary MP4.
- Produces: saved MediaStore item visible in Samsung Gallery, or retake flow that discards the temporary file.

- [ ] Play finalized recording in an in-app preview.
- [ ] Add Retake, Save, and Share actions.
- [ ] Save through MediaStore into a user-visible video collection/folder without broad storage permissions where modern Android APIs allow.
- [ ] Confirm saved MP4 appears in Samsung Gallery.
- [ ] Use Android system share sheet for Share.
- [ ] Clean abandoned temporary recordings safely.
- [ ] Run tests and physical-device validation.
- [ ] Open a separate PR and stop for review.

### Task 10: MVP acceptance and APK artifact

**Files:**
- Add/update `apps/backdrop-recorder/README.md`
- Add GitHub Actions workflow only if needed to build a debug APK artifact without affecting website deployment workflows.
- Add a concise manual acceptance checklist.

**Interfaces:**
- Produces: installable debug APK artifact for user evaluation.

- [ ] Run the full automated test suite.
- [ ] Run the end-to-end physical-device test: install, select background, composited preview, record 1-5 minutes with audio, stop, preview, save, play from Gallery.
- [ ] Verify controls/countdown never appear in the saved video.
- [ ] Verify no network permission/backend/analytics dependency was introduced.
- [ ] Verify website files and deployment behavior are unchanged.
- [ ] Produce an APK artifact the user can install for evaluation.
- [ ] Open the final MVP PR with the acceptance results and APK artifact reference; do not deploy or publish to an app store.
