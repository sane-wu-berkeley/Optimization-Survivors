# Dashboard integration

`dashboard/campus-copilot.html` is a single file. On first load it builds its state from `function seed()` and then keeps edits in `localStorage`. The chat panel answers from that local state. It is not connected to Grok.

Copilot does the integration. It does not restyle the page.

## Put the file on the bot

1. Open Copilot's own chat, not the group.
2. Drop `dashboard/campus-copilot.html` into the chat.
3. Send:

```text
This file is the dashboard. Save it on the shared computer and tell me the path.
Then update only the data inside seed() from campus-brief.md.
Every section is still stale until a worker sends a live reply. Do not invent topics. Do not change the layout, CSS, or the chat script.
When you are done, send the updated file back here.
```

Copilot translates topic states using [handoff-contract.md](handoff-contract.md). A section with no live reply stays labeled stale inside the data it writes. Sample rows are not promoted to live rows.

## What the student does

Open the file Copilot sends back. Hard-refresh. If the browser still shows an older edit, clear `localStorage` for that file or use a private window. The page prefers a saved `localStorage` blob over a freshly edited `seed()` when the version key matches.

## What this is not

Do not merge a worker into Copilot. Do not point the in-page chat at a model API. A routine webhook can wake Copilot from a button, but the reply arrives in the Grok Bot chat, and the webhook key must not be committed here.
