export const AGENTS = [
  {
    "id": "technical-seo-watchdog",
    "name": "Technical SEO Watchdog",
    "description": "Monitors production technical SEO and contact integrity.",
    "deployed": true,
    "disabled": false,
    "cadenceHours": 12,
    "workflows": {
      "RUN_NOW": "technical-seo-watchdog.yml",
      "RETRY": "technical-seo-watchdog.yml"
    },
    "commands": [
      {
        "name": "RUN_NOW",
        "autonomy": "GREEN"
      },
      {
        "name": "RETRY",
        "autonomy": "GREEN"
      }
    ],
    "issueLabel": "technical-seo-watchdog",
    "scheduleUtcHours": [
      0,
      12
    ]
  },
  {
    "id": "opportunity-finder",
    "name": "Opportunity Finder",
    "description": "Finds SEO and demand opportunities.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "local-seo-robot",
    "name": "Local SEO Robot",
    "description": "Improves local search coverage.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "content-creator",
    "name": "Content Creator",
    "description": "Prepares content changes through pull requests.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "video-engine",
    "name": "Video Engine",
    "description": "Builds video content workflows.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "ctr-optimizer",
    "name": "CTR Optimizer",
    "description": "Optimizes titles and snippets.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "internal-link-builder",
    "name": "Internal Link Builder",
    "description": "Improves internal link structure.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "russian-language-robot",
    "name": "Russian-Language Robot",
    "description": "Maintains Russian-language content.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "content-refresher",
    "name": "Content Refresher",
    "description": "Refreshes stale content.",
    "deployed": false,
    "disabled": false,
    "commands": []
  },
  {
    "id": "competitor-monitor",
    "name": "Competitor Monitor",
    "description": "Tracks competitor changes and opportunities.",
    "deployed": false,
    "disabled": false,
    "commands": []
  }
];
