# Dev Console task evidence

This folder contains small, reviewable screenshots referenced by the local
Kanban board. Store each image under a task-specific folder:

```text
tools/dev-console/evidence/<task-id>/<YYYY-MM-DD>-<short-name>.png
```

Keep screenshots at or below 1600 pixels wide and 1 MiB when practical. The
Dev Console refuses to serve files larger than 2 MiB and accepts only PNG,
JPEG, and WebP images with matching file signatures.

Evidence is committed to Git. Use synthetic or adult test data only, crop the
capture to what proves the task, and check it before adding it. Never include:

- passwords, API keys, one-time codes, magic-link URLs, or session tokens;
- real child or family names, email addresses, photos, audio, or video;
- dashboards or terminal output that expose credentials.

External proof such as a CI run belongs in the task as a stable HTTPS link
without query parameters. Do not place linked files or arbitrary documents in
this folder.
