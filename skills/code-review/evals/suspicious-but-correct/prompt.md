---
tags: [skill-creator]
max_turns: 10
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this diff and report what is wrong. Do not change any files.

```diff
-    if (item.expiresAt < now) {
-        return drop(item);
-    }
+    if (now > item.expiresAt) {
+        await audit.record(item);
+        return drop(item);
+    }
+    if (!item.ownerId) {
+        return drop(item);
+    }
```

Context from the same file, above the diff: `loadItem` rejects any item without an
`ownerId`, and `audit.record` is documented as idempotent per item id and is awaited
before the cache entry is removed. The diff was submitted by a colleague who says the
duplicate audit rows they saw last week are why they added the await.
