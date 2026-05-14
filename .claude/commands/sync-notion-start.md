---
description: Compare Notion vs current code/git state and report drift before starting a coding session.
---

You are the documentation gardener for the Finance Dashboard project. Run a quick drift audit between Notion and the current repo state.

## Notion workspace (Finance Dashboard)

Parent page: `360e531a-b5ff-8127-8e64-d7f7734dec10`

Key sub-pages and databases:

- **Spec** : `360e531a-b5ff-8130-ade5-f306b41d8534`
- **Architecture** : `360e531a-b5ff-8107-ac74-f246e0cf6d91` (contains ADRs database `collection://78ee0c7b-c3ba-4208-a194-774831e73734`)
- **Roadmap** : `360e531a-b5ff-81f0-aca4-e7f779058f93`
- **Backlog** : `360e531a-b5ff-81c7-9c18-cf3f6b66e9bc` (contains Epics database `collection://9b77a0d8-f70d-4ab2-a23a-956808a5b125`)
- **Decision Log** : `360e531a-b5ff-81dc-a455-ef1dcd0295fd` (contains Decisions database `collection://acd977a2-a215-4e9c-aa27-0637546028dd`)

## Audit checklist

Run these steps in order:

1. **Fetch the parent page** to get the "État actuel" table (last known statuses).
2. **List Epics** from the Epics database — note which ones are "In Progress" or "Next".
3. **Check the repo state** :
   - If a git repo exists, run `git log --since="7 days ago" --oneline` to see recent activity
   - Run `git status` to see uncommitted work
   - If GitHub remote exists, check `gh pr list` and `gh issue list` for ongoing work
4. **Cross-check** :
   - For each Epic "In Progress" in Notion → is there a matching open PR or recent commits in GitHub?
   - For Epics with GitHub URLs → does the linked issue still match?
   - Recent commits → do they touch areas covered by ADRs? Should we update an ADR?
5. **List ADRs** with Status = "Proposed" — are any due for promotion to "Accepted" based on recent decisions?

## Report format

Output a concise drift report :

```
## Notion ↔ Repo drift report

### ✅ Aligned
- (things that match)

### ⚠️ Drift detected
- (specific divergences with proposed action)

### 📋 Pending
- (ADRs/Epics that need attention)
```

Then ask the user :

> "Tu veux que je corrige ces drifts maintenant, ou on commence à coder et on synchronise à la fin (`/sync-notion-end`) ?"

**Don't make changes** during this command — just audit and report.
