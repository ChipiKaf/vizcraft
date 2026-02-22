---
name: issue-selection
description: "Rules for selecting and processing an open issue to work on based on priority labels and reviewing the ticket body."
---

# Issue Selection

When given a request to find an open issue on the current repository to work on, follow these instructions:

## 1. Prioritize By Labels
Search for issues using their labels, prioritizing them strictly in the following order:
1. `priority: critical`
2. `priority: high`
3. `priority: medium`
4. `priority: low`

Always select an issue with the highest available priority before moving down the list.

## 2. Review the Ticket Body
Before starting any implementation or writing code, you **must** thoroughly read and review the full ticket body (description). 
- Do not rely solely on the issue title to understand the requirements.
- Ensure you fully grasp the context, acceptance criteria, and any other details provided in the issue description.
- If the issue body lacks sufficient detail for implementation or requires further clarification, ask the user before proceeding.
