# thousandoaksinjury-automation

Content production and publishing system for Savostyanov Law Corporation.

## What This System Does

1. You add a row to Google Sheets with a title, script, and `id`.
2. Set `status` to blank or `pending`.
3. Workflow A detects the row, sends it to HeyGen, writes back the `video_id`, sets `status = processing`.
4. Workflow B runs every 10 minutes, checks HeyGen for completion, writes `video_url` and `video_page_url`, sets `status = completed`.
5. Failed videos write `failure_message` and `failure_code` for diagnosis.

You do nothing after step 2. The system handles the rest.

## Repository Structure

```
thousandoaksinjury-automation/
├── .env.example              # All credential placeholders
├── README.md                 # This file
├── n8n/
│   └── workflows/
│       ├── workflow_a_create_video.json   # Trigger → HeyGen create
│       └── workflow_b_poll_status.json    # Cron → HeyGen status poll
├── prompts/
│   ├── video-script-prompt.md            # Claude script generation prompt
│   └── youtube-description-prompt.md     # YouTube description prompt
├── docs/
│   ├── setup.md                          # One-time credential setup
│   └── operations.md                     # Daily workflow for adding content
├── scripts/                              # Future automation scripts
└── website/                              # Website deployment files
```

## Google Sheet Schema

| Column | Purpose |
|---|---|
| `id` | Unique row ID — you set this (e.g. `v001`, `v002`) |
| `title` | Video title |
| `script` | Full spoken script |
| `video_id` | Written by Workflow A |
| `video_url` | Written by Workflow B |
| `video_page_url` | Written by Workflow B |
| `status` | `pending` → `processing` → `completed` / `failed` |
| `failure_message` | Written on error |
| `failure_code` | Written on error |

## Phase Roadmap

- **Phase 1 (current):** Google Sheets → HeyGen video creation and polling
- **Phase 2:** YouTube Shorts auto-upload after `status = completed`
- **Phase 3:** Claude script generation from topic input
- **Phase 4:** Website/SEO asset generation and GitHub deployment
