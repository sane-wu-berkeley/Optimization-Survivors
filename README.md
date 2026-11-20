# Campus Copilot

Berkeley x Stanford Grok Bot Hackathon. Track: Best Student Use Case.

A manager bot runs a student's week while they are away. It asks four workers for deadlines, study gaps, overnight practice, and job matches, then shows one brief. Nothing is written to the calendar until the student approves the list, and nothing is sent from their account.

This repository is the build log and the source the bots read. It is not a slide deck and it does not contain a pitch video.

## What it does

One undergraduate is the user: someone taking several courses on Canvas and Gradescope while also recruiting. Each week they otherwise dig through notification email for due dates, rebuild a study plan from what they missed, and scan job boards.

Campus Copilot splits that into five Grok Bots.

| Bot | Role |
|---|---|
| Copilot | Manager. Talks to the student, messages the workers, merges `campus-brief.md`, and asks before any calendar export. |
| Deadline Scout | Reads Canvas and Gradescope mail. Extracts the assignment, course, due time, and link. Builds an `.ics` only for rows Copilot says were approved. |
| Study Coach | Runs attempt-first review. One full question, the student tries, then a specific gap and a new question. Reports topic state. |
| Practice Builder | Overnight questions, a practice exam, and a cheat sheet sized to the professor's page rules. |
| Career Scout | Weekly jobs ranked against the resume, plus career fairs with dates and sign-up links. |

The dashboard in [dashboard/campus-copilot.html](dashboard/campus-copilot.html) is the screen. The bots are the work. Copilot updates only the `seed()` data in that file. It does not restyle the page, and the chat box inside the page is a local demo script, not the live manager.

## How we built it

Each bot is a separate Grok Bot. Copilot was given its job in chat and told to remember it. Two skills were taught on a fixture, not on live mail:

- `approval-gate`. A fake Deadline Scout table (DATA 8 Homework 5, CS 189 Project 1, CS 189 midterm in 9 days) was shown and no `.ics` was built. DATA 8 was approved and the CS 189 project was rejected. The midterm stayed on the exam list. A rejected deadline is left out of the calendar and out of nothing else.
- `weekly-brief`. Four stale worker blocks were merged into one message: deadlines, the missed topic, the practice file, and one job plus one fair. Missing workers are named. Stale sections stay labeled stale.

Routines on Copilot, America/Los_Angeles:

- Sunday about 6:00pm: weekly brief.
- Morning about 8:00am, including weekends: exam-week check-in, sent only when an exam is within 7 days.

Worker schedules, owned by those bots, not by Copilot:

- Deadline Scout, daily 7:00am.
- Practice Builder, nightly 1:00am, and again 3 days before an exam.
- Career Scout, Monday 8:00am.

Paste-ready jobs are in [bots/](bots/). The message shapes Copilot can merge are in [docs/handoff-contract.md](docs/handoff-contract.md). What is actually finished is in [docs/status.md](docs/status.md).

## How to run it

1. In the Grok Bot app, create Copilot and paste [bots/copilot.md](bots/copilot.md) as its first message. Send `Remember this as your job.`
2. Create the four workers, or import each teammate's template with **Add to Grok Bot**. Importing adds a copy. It does not replace Copilot. Paste the matching file in [bots/](bots/) if that worker does not already have its job.
3. Press `Ctrl+Shift+N` or `Cmd+Shift+N`, choose **New group chat**, and add all five bots in **To:**. Name it Campus Copilot. Tell them to reply in the group.
4. Drop [dashboard/campus-copilot.html](dashboard/campus-copilot.html) into Copilot's own chat and use the message in [docs/integration.md](docs/integration.md).
5. Ask `What's due this week?` Copilot must show Deadline Scout's table and wait. Approve one row and reject one. The `.ics` may contain only the approved row.
6. Open the HTML file Copilot sends back. Deadline, topic, job, and fair data should match `campus-brief.md`. Sample rows stay marked stale until a worker replies for real.

Template links, the session export, and the two-minute screen recording are submitted in the hackathon form. They are not in this repo.

## Challenges

Workers built on four accounts cannot message Copilot. A template link is a copy on the account that imports it, with no line back to the original. The group has to live on one login, which is the account that records the demo.

Copilot will not edit the dashboard until that HTML file is on the shared computer. The page cannot call a bot by itself. A webhook can wake Copilot, but the answer returns in the Grok Bot chat, not inside the page.

The approval list is easy to over-read. Rejecting a project deadline must not drop the exam, and an exam 9 days away must not start the morning check-in. Both of those were corrected in the Copilot thread.

## Accomplishments

Copilot's job, both skills, both routines, and the stale-brief rule are saved. The gate was tested on a two-row fixture. The dashboard prototype covers the week a student actually has: a review session, an approval list, a calendar export, a cheat sheet fit to a page limit, and a job list. The handoff contract is fixed so four workers can be merged without another design pass.

## What we learned

The manager should refuse to invent a due date or a topic when a worker is missing. That refusal is the difference between a brief the student can trust and a demo that looks finished. Partial approval has to be a sentence the student types (`approve DATA 8, reject CS 189`). An all-or-nothing button hides the check the track asks for.

## What's next

Import the four live workers, replace the stale fixture with their replies, and have Copilot write those replies into `seed()`. Then publish five template links from the demo account. A later pass can point a page button at a routine webhook. The webhook key does not belong in this public repo.

## How Grok Bot helped

The bots were set up inside Grok Bot, not exported from another assistant. Copilot remembered the job, saved `approval-gate` and `weekly-brief` after a dry run, scheduled the two routines, and refused to create the four workers when they were missing. The same thread is the session to export, after names, emails, phone numbers, keys, and tokens are removed.

## Inspiration

The time loss is not one hard task. It is Canvas and Gradescope mail, a study plan that has to be rebuilt after every miss, and a separate pass over job boards and career fairs. Most course tools wait for the student to open them. These five bots are meant to do the preparation while the student is signed out, and to stop at the two decisions that are theirs: which deadlines go on the calendar, and whether a cheat sheet draft is approved.
