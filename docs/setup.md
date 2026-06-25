# Setup — One-Time Configuration

## Step 1 — Google Sheet

Your sheet is already linked: `1rFsEvJqvi5thhNVtMaAqTEgDSDzOobU7ZUHpLU3Vog8`

Confirm row 1 has exactly these column headers in this order:

```
id | title | script | video_id | video_url | video_page_url | status | failure_message | failure_code
```

---

## Step 2 — Create the HeyGen API Credential in n8n

This is the only credential you need to create manually.

1. In n8n, go to **Credentials → New**
2. Search for **Header Auth**
3. Fill in:
   - **Name:** `HeyGen API Key`
   - **Name (header field):** `X-Api-Key`
   - **Value:** *(paste your HeyGen API key here)*
4. Click **Save**

Your HeyGen API key is at: **https://app.heygen.com/settings** → API tab

---

## Step 3 — Import Workflows

1. In n8n: **Workflows → Import from File**
2. Import `n8n/workflows/workflow_a_create_video.json`
3. Import `n8n/workflows/workflow_b_poll_status.json`

---

## Step 4 — Connect Credentials Inside Each Workflow

After importing, open each workflow and do the following:

**In Workflow A**, click each of these nodes and select your credentials:
- `HeyGen - Get My Avatar` → select **HeyGen API Key**
- `HeyGen POST v3 Create Video` → select **HeyGen API Key**
- `Google Sheets Trigger` → select your **Google Sheets** account
- `Update Sheet - Set Processing` → select your **Google Sheets** account
- `Update Sheet - Create Failed` → select your **Google Sheets** account

**In Workflow B**, click each of these nodes and select your credentials:
- `HeyGen GET v3 Video Status` → select **HeyGen API Key**
- `Read All Sheet Rows` → select your **Google Sheets** account
- `Update Sheet - Completed` → select your **Google Sheets** account
- `Update Sheet - Failed` → select your **Google Sheets** account

---

## Step 5 — Activate and Test

1. Activate both workflows (toggle in top-right of each workflow).
2. Add a test row to your Sheet:
   - `id`: `v001`
   - `title`: `Test Video`
   - `script`: `This is a test. If you were hurt in an accident, call me directly.`
   - `status`: leave blank
3. Wait up to 60 seconds — `video_id` should appear and `status` should change to `processing`.
4. Wait up to 10 minutes — `status` should change to `completed` with both URLs filled in.

Setup complete. You never need to look up Avatar IDs or Voice IDs — the workflow discovers them automatically from your HeyGen account.
