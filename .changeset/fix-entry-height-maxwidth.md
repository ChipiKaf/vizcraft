---
"vizcraft": patch
---

Fix entry height calculation to account for text wrapping when `maxWidth` is set on compartment entries. Entries that wrap to multiple lines now correctly compute their height and y-offsets, preventing overlap with subsequent entries.
