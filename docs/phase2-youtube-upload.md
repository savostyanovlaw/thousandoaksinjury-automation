# Phase 2 — YouTube Shorts Auto-Upload

## Trigger

Workflow B sets `status = completed` and both URLs are written. A Phase 2 workflow watches for rows where `status = completed` and `youtube_status` is blank.

## Required New Sheet Columns

Add these columns to your Google Sheet for Phase 2:

| Column | Purpose |
|---|---|
| `youtube_status` | blank → `uploading` → `published` / `youtube_failed` |
| `youtube_video_id` | Written after successful upload |
| `youtube_url` | Full YouTube URL |
| `youtube_description` | Auto-generated description (Claude) |
| `youtube_tags` | Auto-generated tags |

## Required New Credentials

| Variable | Where to Get It |
|---|---|
| `YOUTUBE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 Client |
| `YOUTUBE_CLIENT_SECRET` | Same |
| `YOUTUBE_REFRESH_TOKEN` | OAuth flow — run once to generate |
| `YOUTUBE_CHANNEL_ID` | YouTube Studio → Settings → Channel → Advanced |

## Workflow C Architecture

```
Trigger: Google Sheets row where status=completed AND youtube_status=blank
→ Download video from video_url
→ Generate YouTube description via Claude API
→ Upload to YouTube via YouTube Data API v3
→ Write youtube_video_id, youtube_url, youtube_status=published
→ On error: write youtube_status=youtube_failed
```

## YouTube API Quota Note

YouTube Data API v3 allows 6 uploads per day on a standard quota. Request a quota increase at Google Cloud Console if you need more.

## Status: Ready to build when Phase 1 is stable.
