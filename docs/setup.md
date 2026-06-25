# Setup — One-Time Credential Configuration

Do this once. After setup, the system runs without your involvement.

---

## Step 1 — Google Sheet

1. Create a new Google Sheet.
2. Name the first tab `Sheet1`.
3. Add these exact column headers in row 1, in this order:

```
id | title | script | video_id | video_url | video_page_url | status | failure_message | failure_code
```

4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/THIS_PART_IS_YOUR_ID/edit`

---

## Step 2 — n8n Environment Variables

In n8n, go to **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `GOOGLE_SHEET_ID` | Your Sheet ID from Step 1 |
| `HEYGEN_API_KEY` | From HeyGen dashboard → Settings → API Keys |
| `HEYGEN_AVATAR_ID` | From HeyGen → Avatars → select your avatar → copy ID |
| `HEYGEN_VOICE_ID` | From HeyGen → Voice Library → select voice → copy voice_id |

---

## Step 3 — n8n Google Sheets Credential

1. In n8n, go to **Credentials → New → Google Sheets OAuth2**.
2. Follow the OAuth flow — sign in with the Google account that owns your Sheet.
3. Name the credential `Google Sheets — Savostyanov`.
4. After importing the workflow JSON files, open each Google Sheets node and select this credential.

---

## Step 4 — Import Workflows

1. In n8n: **Workflows → Import from File**.
2. Import `n8n/workflows/workflow_a_create_video.json`.
3. Import `n8n/workflows/workflow_b_poll_status.json`.
4. In every Google Sheets node in both workflows, select your `Google Sheets — Savostyanov` credential.
5. Activate both workflows.

---

## Step 5 — Test

1. Add one row to your Sheet with a unique `id`, a `title`, a short `script`, and leave `status` blank.
2. Wait up to 60 seconds for Workflow A to trigger.
3. Confirm `video_id` appears and `status` changes to `processing`.
4. Wait up to 10 minutes for Workflow B to update `status` to `completed`.

Setup is complete.
