## Question

Why does the observability history.jsonl have only 10 entries despite extensive pi usage? Investigate:

1. Is the dynamic-footer observability pipeline working correctly? Check the segment configuration in ~/.pi/agent/observability/settings.json.
2. Is the history.jsonl being truncated, rotated, or not written to?
3. Is there a gap between sessions having footer display data and sessions being recorded to history?
4. What would need to change to get reliable cost and session tracking?

Deliverable: Root cause assessment of the sparse history and a recommendation for fixing or replacing the observability pipeline.
