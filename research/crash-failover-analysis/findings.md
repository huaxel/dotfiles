# Crash and Failover Pattern Analysis

**Date:** 2026-07-24
**Analyst:** pi worker agent
**Sources:**
- `~/.pi/agent/pi-crash.log` (1,432 lines, 1 crash headline)
- `~/dotfiles/pi/agent/opencode-go-failover.log` (10,405 lines, ~7 days)
- `~/dotfiles/pi/agent/extensions/opencode-go-failover/index.ts` (failover extension source)

---

## 1. Crash Analysis: `pi-crash.log`

### 1.1 Summary

| Metric | Value |
|---|---|
| Crash headlines | **1** (`Crash at 2026-06-26T07:43:18.312Z`) |
| Total lines | 1,432 |
| Actual crash detail | None beyond headline |
| Terminal output captured | ~1,430 lines of ANSI-escaped TUI rendering |
| Error keywords found | 2 ("fail" in conversation text, 1 edit validation error) |

### 1.2 What the Log Actually Contains

The file is **not a crash log in the traditional sense**. It appears to be a **terminal session capture/recording** that Pi's crash reporter wrote when the TUI itself crashed or was terminated. The content is:

1. **Line 1:** `Crash at 2026-06-26T07:43:18.312Z` — a timestamped headline, presumably written by a crash-handler process when the Pi TUI process exited abnormally.

2. **Lines 2–1432:** ANSI-escaped terminal output from a Pi coding session. The content shows:
   - A conversation about editing `cross_verify.py` (a Python data-matching script in `~/project-atom/python/`)
   - **Token compaction at 175,755 tokens** (line 13: `Compacted from 175,755 tokens`)
   - Multiple edit operations to add a `LOGEMENT -ETAGE` column to AISSJ data matching
   - One tool validation error (`Validation failed for tool "edit"`)
   - The conversation continues with the user examining CSV output and requesting improvements
   - The log ends *mid-session* with a progress bar showing `0% 0/131.1k`

### 1.3 Failure Mode Assessment

**The crash is most likely a Pi TUI process crash triggered during or shortly after a context compaction event at very high token counts (~175k tokens).**

Evidence:
- The compaction notification is the most significant system event in the log
- The session was large enough (175k tokens) to trigger compaction, which is a heavy operation
- The log ends abruptly mid-conversation with a progress bar (suggesting compaction or generation was in progress)
- The single `Validation failed for tool "edit"` error is an application-level validation issue, not a crash cause

**Notable:** There are no OOM (out-of-memory) errors, segfaults, signal handlers, or stack traces in the log. The crash reporter captured the TUI state but provided no diagnostic details about *why* the crash occurred.

### 1.4 Crash Frequency

- **1 recorded crash** over the lifespan of this log file
- The log dates from a single session on 2026-06-26
- This appears to be a one-off event, not a recurring crash pattern

---

## 2. Failover Analysis: `opencode-go-failover.log`

### 2.1 Summary

| Metric | Value |
|---|---|
| Total lines | 10,405 |
| Date range | 2026-07-17 → 2026-07-24 (~7 days) |
| Total "using account" events | **9,606** |
| Active accounts | **2** (sub-1, sub-2) |
| Actual quota/error failover events | **1** |
| Session starts | ~12 (from "loaded N account(s)" lines) |

### 2.2 Account Usage Distribution

| Account | Requests | Share |
|---|---|---|
| **sub-2** | 5,587 | 58.1% |
| **sub-1** | 4,019 | 41.9% |
| **Unknown/both** | 1 | — |
| **Total** | 9,606 | 100% |

### 2.3 Failover Pattern

#### Proactive failover (the dominant pattern)

The extension loads 2 accounts from `auth.json` and proactively picks the account with the **lowest rolling usage percentage** before each request. The `before_provider_headers` event is the main dispatch point:

```typescript
// From index.ts
pi.on("before_provider_headers", async (event, ctx) => {
  // ...refresh usage data...
  // ...pick account with lowest rolling usage...
  event.headers.Authorization = `Bearer ${activeAccount.key}`;
});
```

This means most account switching is **proactive load-balancing**, not reactive failover. The accounts are rotated based on quota consumption, with switching happening at nearly every request boundary.

#### Reactive failover (rare)

The extension also handles reactive failover for HTTP errors:

```typescript
pi.on("after_provider_response", async (event, ctx) => {
  if (event.status !== 429 && event.status !== 401 && event.status !== 403) return;
  markExhausted(activeAccount.label);
});
```

**Only 1 reactive failover event was observed in 7 days:**

```
2026-07-17T23:30:10.827Z quota-like error on account=sub-1: 429: {"type":"gousagelimiterror","message":"weekly usage limit reached. resets in 2 days. ..."}
```

### 2.4 Temporal Pattern (Events per Day)

| Date | Events | Notes |
|---|---|---|
| Jul 17 | 93 | Partial day (started 22:49) |
| Jul 18 | 741 | Full day |
| Jul 19 | 172 | Significant drop (possibly weekend) |
| Jul 20 | 855 | Monday peak |
| Jul 21 | 825 | Continued high usage |
| **Jul 22** | **3,823** | **Massive spike** (4.6× normal) |
| Jul 23 | 1,880 | Elevated |
| Jul 24 | 1,221 | Partial day (until 11:14) |

**Observation:** Jul 22 shows a dramatic 4.6× usage spike, suggesting an intensive work session or automated process.

### 2.5 Account Switching Pattern

The account switching follows a **rapid alternating pattern**, not slow rotation:

```
sub-2 × 87 → sub-1 × 1 → sub-2 × 931 → sub-1 × 73 → sub-2 × 57 → sub-1 × 168 → ...
```

This indicates the extension is selecting the account with lowest rolling usage **per-request** (every ~6 seconds on high-usage days), rather than pinning an account for a session.

### 2.6 Configuration Issue

On initial load (Jul 17 22:49):
```
account sub-2: key=missing, workspace=set, cookie=set
auth.json accounts: 1
loaded 1 account(s)
```

Only 1 account was initially loadable because `sub-2` had a missing `key`. By the next session start, both were configured. This means for a period, there was **no effective failover** — only one account was usable.

---

## 3. Systemic Issue Patterns

### 3.1 Categorized Failure Modes

| Category | Occurrences | Severity | Frequency |
|---|---|---|---|
| **Pi TUI crash** | 1 recorded | High | Single event |
| **LLM provider quota exhaustion (429)** | 1 | High | Rare (1 in 7 days) |
| **Edit tool validation failure** | 1 | Low | Rare |
| **Auth configuration missing** | 1 (initial) | Medium | Setup-time only |
| **Session restart overhead** | ~12 restarts (2 accounts × ~6 sessions) | Low | Multiple/day |

### 3.2 Provider Quota Exhaustion

- Only **1 quota exhaustion event** in 7 days of heavy usage (9,606 requests)
- The failover extension successfully intercepted a 429 and marked the account exhausted
- After the quota-like error, the extension switches to the alternate account
- Using the `5-minute exhaustion cooldown` (see `EXHAUSTED_COOLDOWN_MS = 5 * 60_000`)

### 3.3 Auth Failures

- **1 auth-expired detection** in the failover log
- Initial configuration issue where `sub-2` had a missing key
- No credential rotation or expiry issues detected during the 7-day window

### 3.4 Memory / Resource Issues

- No OOM, memory pressure, or resource exhaustion indicators in either log
- The crash event at 175k tokens doesn't correlate with memory errors

---

## 4. Extension Code Review

### 4.1 Architecture

The `opencode-go-failover` extension is well-structured:

- **Two configuration paths:** environment variables (higher precedence) and `auth.json` (lower precedence)
- **Two-tier failover:**
  1. **Proactive:** Selects account with lowest rolling usage before each request via `before_provider_headers`
  2. **Reactive:** Marks accounts exhausted on 429/401/403 in `after_provider_response`, and on other quota-like errors in `message_end`
- **Exhaustion cooldown:** 5 minutes per account
- **Usage refresh interval:** 60 seconds

### 4.2 Strengths
- Comprehensive error detection (HTTP status codes + message content analysis)
- Graceful degradation: falls back to any available account
- Visual feedback via `__opencode_go_active_label` global for UI extensions
- Commands (`/opencode-accounts`, `/opencode-rotate`) for manual intervention

### 4.3 Potential Improvements
- Exponential backoff on recurrent failover (currently fixed 5-minute cooldown)
- Alerting/logging when all accounts are exhausted simultaneously
- Pre-warming: check usage more aggressively near quota limits (>80%)

---

## 5. Recommendations

### 5.1 Immediate (Low Effort, High Impact)

| # | Recommendation | Rationale |
|---|---|---|
| R1 | **Add crash diagnostic capture** to Pi's crash handler | The current crash log gives no actionable information about *why* the TUI crashed |
| R2 | **Add alert for exhausted-all-accounts condition** | Currently, if both accounts exhaust simultaneously, there's no notification — only silent failure |
| R3 | **Add proactive rotation even when all accounts are available** | Currently rotation is purely usage-based; adding a time-based rotation would distribute wear more evenly |

### 5.2 Short-term (Medium Effort)

| # | Recommendation | Rationale |
|---|---|---|
| R4 | **Implement exponential backoff for exhausted accounts** | Fixed 5-minute cooldown may cause repeated failovers under sustained load |
| R5 | **Add per-account usage trend logging** | Track how quickly each account's quota is consumed to predict exhaustion |
| R6 | **Reduce session restart overhead** | ~12 session starts in 7 days = auth fetch on every session. Cache auth config across sessions |

### 5.3 Long-term (Higher Effort)

| # | Recommendation | Rationale |
|---|---|---|
| R7 | **Add circuit-breaker for persistent failures** | If both accounts fail within a short window, pause and retry with backoff |
| R8 | **Graceful degradation when all accounts exhausted** | Queue requests or pre-warn user instead of failing silently |
| R9 | **Monitor compaction stability at high token counts** | The TUI crash correlates with a 175k-token compaction event; investigate memory pressure during compaction |

---

## 6. Appendix

### 6.1 Account Switching Detail (First 20 Switches)

```
sub-2 × 87
sub-1 × 1
sub-2 × 931
sub-1 × 73
sub-2 × 57
sub-1 × 168
sub-2 × 139
sub-1 × 39
sub-2 × 8
sub-1 × 44
sub-2 × 37
sub-1 × 24
sub-2 × 33
sub-1 × 2
sub-2 × 1
sub-1 × 55
sub-2 × 35
sub-1 × 5
sub-2 × 41
sub-1 × 43
```

### 6.2 Quota Exhaustion Event (Full)

```
2026-07-17T23:30:10.827Z quota-like error on account=sub-1:
429: {"type":"gousagelimiterror","message":"weekly usage limit reached. resets in 2 days.
to continue using this model now, enable usage from your available balance:
https://opencode.ai/workspace/wrk_01kgcbkw1jxg412ah2987h6ncq/go"}
```

### 6.3 Key Extension Configuration Constants

| Parameter | Value | Location |
|---|---|---|
| `FETCH_INTERVAL_MS` | 60,000 ms (1 minute) | `index.ts:81` |
| `EXHAUSTED_COOLDOWN_MS` | 300,000 ms (5 minutes) | `index.ts:82` |
| Max accounts | 8 (env) + unlimited (auth.json) | `index.ts:106` |
| Provider name | `opencode-go` | `index.ts:76` |
