---
name: Private gallery media
description: The project pattern for serving authenticated user-uploaded gallery media to native and web clients.
---

Private gallery media should be streamed through an authenticated API endpoint and cached by the client before rendering.

**Why:** Native and web image/video components do not consistently provide a safe bearer-token path for private object URLs, while direct public object URLs would bypass account and ownership checks.

**How to apply:** Keep object paths private, authorize the gallery record before streaming, and resolve the authenticated response into a device file or web object URL for playback.