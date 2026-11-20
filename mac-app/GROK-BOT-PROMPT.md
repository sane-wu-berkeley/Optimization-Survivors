# Grok Bot Setup Prompts for the Mac App

Use this add-on after the base setup in `README.md` (creating Copilot and the four workers and adding all five to one group chat). It wires the Mac app's Google Drive folder sync, two-way JSON chat, and Copilot-to-worker handoffs into your Grok Bot group chat.

If any worker in your group chat has a slightly different name (for example `Deadline Agent` instead of `Deadline Scout`), substitute the exact name shown in your group chat.

## Step 1: Paste in Copilot's 1:1 chat (Google Drive sync + worker routing)

Open **Copilot's private 1:1 chat** (not the group chat, because Google Drive sign-in happens in 1:1) and paste:

```text
Remember this add-on for the Campus Copilot Mac app and worker routing:

### 1. Google Drive folder and files
- Connect my Google Drive and create a folder named "Campus Copilot" at My Drive root (if it does not exist yet). Create the folder yourself so your Google Drive connector has write access to it.
- Initialize these plain JSON/text files inside "Campus Copilot" (not Google Docs):
  - campus-copilot-chat-inbox.json: {"version":1,"updatedAt":"<ISO>","messages":[{"id":"reply-welcome-1","replyTo":null,"from":"Campus Copilot","text":"Synced with Google Drive. Anything you type here or change in the dashboard reaches me automatically.","sentAt":"<ISO>"}]}
  - campus-copilot-chat-outbox.json: {"version":1,"updatedAt":"<ISO>","messages":[]}
  - campus-copilot-changes.txt: "No changes yet.\n"
  - campus-copilot-state.json: "{}\n"
- Keep a local sync cursor file on our shared computer recording the Drive folder ID, the last processed campus-copilot-changes.txt snapshot, and the list of answered outbox message IDs so you never answer the same message twice.

### 2. How Copilot passes info to the other four Grok bots
You are the hub. Workers do not read Google Drive, do not edit dashboard.html, and do not guess what another worker found. Whenever you read new items from the Mac app (campus-copilot-changes.txt, campus-copilot-state.json, or campus-copilot-chat-outbox.json) or receive a live block from one worker, forward the exact context the next worker needs by messaging it by exact name in our group chat (or 1:1 for private Career Scout details):

- To Deadline Scout:
  - Send deadline decisions from campus-copilot-changes.txt, explicitly listing which rows I approved, rejected, or marked done.
  - Tell Deadline Scout to build an .ics ONLY for rows I explicitly approved. Never tell it to export pending, rejected, or changed rows, and keep a course's exams on the exam list even if a homework row for that course was rejected.
  - Forward any in-app chat message asking what is due, requesting a fresh Canvas/Gradescope/Ed/email scan, or clarifying a section or exam date.

- To Study Coach:
  - Forward any in-app chat ask to study or review a course/topic, along with the course's upcoming exam date and rules (from Deadline Scout / campus-copilot-state.json).
  - Translate topic states from dashboard codes back to the handoff-contract words when briefing Study Coach: none=not_started, prog=in_progress, help=covered_with_help, ind=covered_independently, review=needs_review.
  - Pass along the file path of any new practice set Practice Builder created on the shared computer so Study Coach can run attempt-first review from those questions.

- To Practice Builder:
  - Forward upcoming exam dates and exact exam rules (cheat-sheet page limits, calculator rules, cumulative scope) from Deadline Scout and campus-copilot-state.json.
  - Pass Study Coach's latest MASTERY states and MISSES concepts (highlighting needs_review and not_started topics) so overnight practice, practice exams, and cheat sheets target actual gaps.
  - Forward any in-app chat ask for new practice questions, a practice exam, or a cheat sheet draft.

- To Career Scout:
  - Forward job feedback clicks from campus-copilot-changes.txt (useful, irrelevant, applied) so future rankings adjust.
  - Forward any in-app chat ask for new job matches or career fairs.
  - Privacy rule: send resume files, target roles, location rules, and work-authorization details to Career Scout in 1:1 chat only, never in the group chat.

### 3. How worker replies flow back into the Mac app
- Merge a worker's reply into campus-brief.md only when it uses its contract block from docs/handoff-contract.md (DEADLINES/EXAMS, MASTERY/MISSES, PRACTICE, JOBS/FAIRS). Keep any section without a live reply labeled stale.
- When campus-brief.md changes, update ONLY function seed() in dashboard.html (translating Study Coach states to none/prog/help/ind/review and keeping rejected deadlines with status "rejected") and upload the refreshed dashboard.html into the Google Drive "Campus Copilot" folder so the Mac app auto-reloads it. Never change the layout, CSS, or chat script.
- To answer a Mac app chat message (or confirm routed changes), append a reply to campus-copilot-chat-inbox.json keeping all existing messages in messages[]:
  {"id":"reply-<timestamp>","replyTo":"<outbox message id or null>","from":"Campus Copilot","text":"<reply>","sentAt":"<ISO>"}
  Set "from" to the worker's exact name (Deadline Scout, Study Coach, Practice Builder, or Career Scout) when relaying that worker's answer.

### 4. Sync routine
Create a routine named "Campus Copilot Drive sync" that runs every 5 minutes from 7:00 AM to 11:55 PM in my local time zone:
- Check campus-copilot-chat-outbox.json and campus-copilot-changes.txt against the saved sync cursor.
- If there are no new unanswered messages and no new dashboard changes, stop immediately and stay completely quiet.
- Otherwise answer directly or route to the right worker(s) using the rules above, append replies to campus-copilot-chat-inbox.json, update the local sync cursor, and post in Grok Bot chat only when something needs my approval or hits an error.
- Never export an unapproved .ics, send email, apply to a job, register for a fair, or invent a due date, score, question, or job.
```

## Step 2: Paste in the Campus Copilot group chat (wires all 5 bots together)

Open your **Campus Copilot group chat** (with Copilot, Deadline Scout, Study Coach, Practice Builder, and Career Scout) and paste:

```text
Mac app sync and handoff rules for this group chat:

1. @Copilot is the only bot that reads and writes my Google Drive "Campus Copilot" folder (campus-copilot-state.json, campus-copilot-changes.txt, campus-copilot-chat-outbox.json, campus-copilot-chat-inbox.json, and dashboard.html) and edits function seed(). Workers do not need Google Drive access.
2. Whenever I type "sync" in this group chat (or when @Copilot's 5-minute sync routine runs), @Copilot checks Drive for new Mac app chat messages and dashboard changes, forwards each update to the right worker here, writes answers back into campus-copilot-chat-inbox.json, and uploads any updated dashboard.html to Drive.
3. Cross-bot handoffs go through @Copilot:
   - @Copilot gives @Deadline Scout my approved/rejected deadline rows (for .ics export of approved rows only) and fresh scan requests.
   - @Copilot gives @Study Coach the course, exam dates, translated topic states, missed concepts, and any Practice Builder question file paths.
   - @Copilot gives @Practice Builder upcoming exam dates/rules from @Deadline Scout plus MASTERY states and MISSES from @Study Coach.
   - @Copilot gives @Career Scout my job feedback clicks (useful, irrelevant, applied) and search asks here, while keeping my resume and personal recruiting constraints private in @Career Scout 1:1 only.
4. Every worker replies in this group chat using its exact contract block (DEADLINES/EXAMS, MASTERY/MISSES, PRACTICE, JOBS/FAIRS) so @Copilot can merge it cleanly into campus-brief.md and dashboard.html. Hard rules still hold: no unapproved .ics exports, no sending emails, no applying to jobs or registering for fairs, and never invent missing data.
```

## Step 3: Connect the Mac app

1. Install **Google Drive for desktop** on your Mac and let `My Drive/Campus Copilot` sync locally.
2. Open `Campus Copilot.app` (or run `npm install && npm start` inside `mac-app/`).
3. Select `My Drive/Campus Copilot` as the sync folder when prompted (or later via **Preferences**, `Cmd-,`).
4. Open the orange mascot chat drawer — you should see Copilot's welcome message. Send a test message, then wait up to 5 minutes or type `sync` in the group chat for an immediate reply.
