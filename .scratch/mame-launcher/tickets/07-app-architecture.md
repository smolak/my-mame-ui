---
id: 07
labels: [wayfinder:grilling]
status: open
assignee:
blocked_by: [01, 05]
---
# App architecture

## Question

What runs in the Bun main process vs the webview, and what is the RPC contract between them? Module boundaries (MAME adapter, Library index, Scraper, Launcher, personal state store), how long-running jobs (scan, verify, scrape) report progress, and how media files reach the UI.
