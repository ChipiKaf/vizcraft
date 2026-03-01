---
'vizcraft': patch
---

The fix prevents commit() from using a stale cached runtimePatchCtx (which could reference detached DOM elements) by always recreating it after \_renderSceneToDOM, and removes the redundant strokeDasharray write from patchRuntime so that base style is owned by a single write path.
