# Import and Test — Step by Step

## Step 1 — Create the HeyGen Credential

1. In n8n: **Credentials → New → Header Auth**
2. **Name:** `HeyGen API Key`
3. **Header Name:** `X-Api-Key`
4. **Value:** paste your HeyGen API key
5. Click **Save**

---

## Step 2 — Import Workflow A

1. In n8n: **Workflows → Import from File**
2. Select `workflow_a_create_video.json`
3. Click **Import**

---

## Step 3 — Import Workflow B

1. In n8n: **Workflows → Import from File**
2. Select `workflow_b_poll_status.json`
3. Click **Import**

---

## Step 4 — Assign Credentials

After importing, open each workflow. For every node showing a red credential warning:

- **Google Sheets nodes** → select your **Google Sheets** account (already connected)
- **HeyGen HTTP nodes** → select **HeyGen API Key**

Do this for both Workflow A and Workflow B before activating either.

---

## Step 5 — Add One Test Row to Google Sheet

Open your Google Sheet and add a single row with these columns:

| id | title | script | status |
|---|---|---|---|
| v001 | Test Video | If you were hurt in an accident in Thousand Oaks, call me directly before speaking with insurance. I am Alexey Savostyanov, personal injury attorney. | *(leave blank)* |

Leave `status` blank — or type `pending`. Leave all other columns empty.

---

## Step 6 — Test Workflow A

1. Open **Workflow A** in n8n
2. Click **Test workflow** (do not activate yet)
3. Add the test row to the sheet **after** clicking Test
4. Wait up to 60 seconds
5. Confirm in the sheet:
   - `video_id` is populated
   - `status` = `processing`

If `status` = `failed`, check `failure_message` and `failure_code` in the sheet for the reason.

---

## Step 7 — Activate Workflow B First

1. Open **Workflow B**
2. Assign all credentials if not already done
3. Click **Activate**
4. Workflow B will run automatically every 10 minutes

---

## Step 8 — Activate Workflow A

Only after confirming one row reached `status = processing`:

1. Open **Workflow A**
2. Click **Activate**

Do not activate bulk rows until one video confirms `status = completed` with both `video_url` and `video_page_url` populated.

---

## Status Reference

| Status | Meaning |
|---|---|
| *(blank)* or `pending` | Waiting to be submitted |
| `processing` | Submitted to HeyGen, rendering |
| `completed` | Done — `video_url` and `video_page_url` are filled |
| `failed` | Error — check `failure_message` and `failure_code` |

## Re-Queue a Failed Row

Clear the `status` cell (leave blank) and the workflow will resubmit on the next trigger.
