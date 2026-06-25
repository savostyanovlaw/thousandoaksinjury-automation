# Operations — Daily Content Production

## To Generate a New Video

1. Open your Google Sheet.
2. Add a new row with:
   - `id` — unique identifier, e.g. `v003` (never reuse an ID)
   - `title` — video title
   - `script` — the full spoken script for the video
   - `status` — leave blank, or type `pending`
3. Done. The system handles everything else.

## What Happens Automatically

| Time | Action |
|---|---|
| Within 1 minute | Workflow A detects the row, submits to HeyGen, writes `video_id`, sets `status = processing` |
| Within 10 minutes | Workflow B polls HeyGen, writes `video_url` and `video_page_url`, sets `status = completed` |

## Status Reference

| Status | Meaning |
|---|---|
| *(blank)* or `pending` | Waiting to be submitted to HeyGen |
| `processing` | Submitted to HeyGen, waiting for render |
| `completed` | Video is ready — `video_url` and `video_page_url` are populated |
| `failed` | HeyGen returned an error — check `failure_message` and `failure_code` |

## If a Video Fails

1. Check the `failure_message` and `failure_code` columns.
2. Fix the issue (usually a script that is too long, or empty script).
3. Clear the `status` cell (leave it blank) to requeue the row.
4. Workflow A will pick it up on the next trigger.

## Re-Queuing a Failed Row

Set `status` to blank or `pending`. The system retriggers automatically.

Do not change `id`. Do not delete the row.

## Script Best Practices

- Target 90–150 words per video (30–60 seconds at normal speaking pace).
- Write in plain conversational English — how you would speak to a client in your office.
- End with a call to action: "Call me directly for a free consultation."
- Avoid legal citations, case numbers, and Latin terms.
