# Backdrop Recorder

Android-first mobile video recorder MVP optimized for Samsung Galaxy A23-class devices.

## First APK scope

This first build intentionally focuses on a simple install-and-evaluate loop:

- launches as a portrait Android app;
- requests camera permission;
- shows the front camera preview;
- lets the user choose a JPG/PNG image through the Android Photo Picker;
- shows the chosen image as the active background selection in the recording screen;
- remains fully offline and does not modify the website.

Full person segmentation, composited recording, audio muxing, teleprompter, captions, and editing are later milestones.

## Local build

Use JDK 17 and Gradle 8.9:

```bash
gradle testDebugUnitTest assembleDebug
```

APK output:

`app/build/outputs/apk/debug/app-debug.apk`
