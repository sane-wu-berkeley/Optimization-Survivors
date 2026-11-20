# Handoff contract

Copilot merges a worker only when the message uses that worker's block. A paragraph does not count. A missing link, date, or file name stays blank. Workers do not guess one.

Workers message Copilot. They do not write `campus-copilot.html`. Copilot is the only bot that edits `seed()`.

## Deadline Scout

```text
DEADLINES
course | title | due date and time | link | new or changed
EXAMS
course | name | date
```

Run after the 7:00am scan, and again whenever Copilot asks what is due. Build an `.ics` only when Copilot names rows and says the student approved them. Leave out rejected rows, unanswered rows, and rows that are new or changed since the approval.

## Study Coach

```text
MASTERY
course | topic | not_started or in_progress or covered_with_help or covered_independently or needs_review
MISSES
concept
```

Send this at the end of a review. If there are no topics yet, say `no results yet`. Do not invent a topic.

## Practice Builder

```text
PRACTICE
course | questions, practice exam, or cheat sheet | file name
```

Send this after the 1:00am run and after the run 3 days before an exam. If the file is not on the shared computer, still name it and say it is missing.

## Career Scout

```text
JOBS
rank | title | employer | one-line reason | url
FAIRS
name | when | where | sign-up url
```

Send this after the Monday 8:00am run. Do not apply, email a recruiter, or register the student.

## State words

Study Coach reports the long names. Copilot translates them when it writes the dashboard.

| Bot | Page `seed()` |
|---|---|
| `not_started` | `none` |
| `in_progress` | `prog` |
| `covered_with_help` | `help` |
| `covered_independently` | `ind` |
| `needs_review` | `review` |

A deadline `status` in the page is `pending`, `approved`, `rejected`, or `done`. Rejected stays in the list so the student can see it was considered. It is not exported.
