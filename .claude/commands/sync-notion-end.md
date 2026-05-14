---
description: Update Notion based on what happened in this coding session (statuses, ADRs, decisions, links).
---

You are the documentation gardener for the Finance Dashboard project. Wrap up the session by syncing Notion with what just happened in the code.

## Notion workspace (Finance Dashboard)

Parent page: `360e531a-b5ff-8127-8e64-d7f7734dec10`

Key sub-pages and databases:

- **Spec** : `360e531a-b5ff-8130-ade5-f306b41d8534`
- **Architecture** : `360e531a-b5ff-8107-ac74-f246e0cf6d91` (contains ADRs database `collection://78ee0c7b-c3ba-4208-a194-774831e73734`)
- **Roadmap** : `360e531a-b5ff-81f0-aca4-e7f779058f93`
- **Backlog** : `360e531a-b5ff-81c7-9c18-cf3f6b66e9bc` (contains Epics database `collection://9b77a0d8-f70d-4ab2-a23a-956808a5b125`)
- **Decision Log** : `360e531a-b5ff-81dc-a455-ef1dcd0295fd` (contains Decisions database `collection://acd977a2-a215-4e9c-aa27-0637546028dd`)

## Sync checklist

Run these steps in order:

1. **Look at what changed this session** :
   - Run `git log --since="<session start>" --oneline` (use the time the session began)
   - Run `git status` for uncommitted work
   - Review the conversation context for decisions made out loud
   - Check `gh pr view` and `gh issue list --state=all --search="updated:>=<date>"` if a GitHub remote exists

2. **For each significant event, propose a Notion update** :
   - **Epic status change** (Backlog → Next → In Progress → Review → Done) → update the Epics database entry
   - **PR merged that closes an Epic** → set Status = Done and append the PR URL
   - **New technical decision discussed** → propose creating an ADR (or updating an existing one)
   - **New product/process decision** → propose creating a Decision Log entry
   - **Spec drift** (we ended up doing something different from the spec) → propose updating the Spec page

3. **Propose updates clearly before applying them** :

   ```
   ## Proposed Notion updates

   ### Epics
   - EPIC-1 (Setup & Foundation) : Status "Next" → "In Progress" (commits abc1234, def5678)

   ### ADRs
   - NEW ADR : "Use Vite over Webpack for the renderer build" (Accepted, Architecture)

   ### Decisions
   - NEW : "Test coverage target = 70% pour la v1" (Process)

   ### Spec
   - §4 Pipeline d'Import : add OFX detection logic that differs from initial design
   ```

4. **Apply only after user confirmation** : "Je pousse ces mises à jour sur Notion ?"

5. **After applying**, output a one-liner summary :
   ```
   ✅ Notion synced : 1 Epic moved, 1 ADR created, 1 Decision logged.
   ```

## Rules

- **Never** invent decisions — only sync what genuinely happened in the session
- **Always** ask before pushing — the user might want to reword or hold off
- **Cross-link** : when updating an Epic with a GitHub URL, also reference the Epic in the relevant ADRs/Decisions if any
- **Be brief** : the goal is to make sync friction-free, not to write essays
