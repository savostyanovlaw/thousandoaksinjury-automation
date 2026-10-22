# Backdrop Recorder Android MVP Design

## Goal
Build an offline-first Android app, initially optimized for Samsung Galaxy A23-class hardware, that lets the user choose a JPG/PNG background, see themselves composited over that background using the front camera, record the composited result with microphone audio, preview it, and save an MP4 to the device gallery.

## User experience
1. Launch app.
2. Tap New Recording.
3. Pick a background image from the device.
4. See front-camera preview with the real background removed and the user composited over the selected image.
5. Tap Record; show a 3-2-1 countdown.
6. Record the composited video and microphone audio.
7. Tap Stop.
8. Preview the result.
9. Retake or save/share the MP4.

The app must be understandable without technical configuration. No account, backend, login, or cloud processing is allowed in MVP.

## MVP scope
- Native Android app in Kotlin.
- App lives under `apps/backdrop-recorder/` so website code remains untouched.
- Portrait-first 9:16 workflow.
- Front camera.
- Android photo picker for JPG/PNG background selection.
- On-device person/background segmentation.
- Real-time composited preview.
- Microphone audio.
- MP4 recording of the composited output, not the raw camera stream.
- Preview, retake, save to Gallery, and system share sheet.
- 3-second countdown.
- Performance diagnostics sufficient to detect dropped frames and segmentation slowdown.
- Graceful fallback to 720x1280 if 1080x1920 cannot be sustained.

## Explicitly out of scope for MVP
- Teleprompter.
- Automatic captions.
- Cloud storage or sync.
- User accounts.
- Music editing.
- Beauty filters.
- AI eye-contact correction.
- Multi-track editing.
- iOS support.

## Architecture
Use a native Android pipeline. CameraX provides front-camera frames and preview lifecycle. A local segmentation component produces a person mask from reduced-resolution analysis frames. A GPU-backed renderer composites the camera image, mask, and selected background into the final vertical frame. The same rendered output must feed both the preview and the recorder so the saved video matches what the user saw. MediaCodec encodes H.264 video; microphone audio is encoded as AAC; MediaMuxer writes MP4. MediaStore saves the completed file to the Gallery.

Keep user-interface overlays separate from the video render surface so buttons, timers, countdown text, guides, and later teleprompter text never appear in the recording.

## Performance requirements
Design for Galaxy A23-class devices with approximately 4 GB RAM and modest mobile GPU/CPU capacity. Never run segmentation at full 1080p. Downscale analysis frames, drop analysis frames rather than queueing them, reuse the latest mask between segmentation results, and apply light spatial/temporal smoothing. Prefer stable A/V sync and smooth output over maximum segmentation frequency.

Target output is 1080x1920 at 30 fps H.264 with AAC audio. If sustained performance is inadequate, automatically fall back to 720x1280 at 30 fps. Do not support 4K or 60 fps in MVP.

## Privacy
All processing is local. Backgrounds, video, audio, masks, and diagnostics must not leave the device. No analytics SDK or network permission is required for MVP.

## Project boundaries
- Do not modify existing website behavior or website production files except repository-level documentation/workflow files strictly required for the app.
- Keep Android code inside `apps/backdrop-recorder/`.
- Use PR-only workflow. Never push application changes directly to `main`.
- Each implementation milestone should be independently reviewable and runnable.

## Acceptance test for MVP
On a Samsung Galaxy A23-class Android device, the user can install the APK, select a background image, see themselves composited over it, record a 1-5 minute vertical video with microphone audio, stop, preview it, and save a playable MP4 to Gallery. The UI overlays do not appear in the saved video, and audio remains acceptably synchronized with video.
