---
name: deepen-task
description: Strengthen a task prompt by surfacing professional standards, primary evidence, methods, and independent validation before rewriting it. Use when the user asks for a deeper version of a task, prompt, research request, analysis, or investigation—not a broader or bigger one.
---

# Deepen a Task Prompt

Turn the user's task into a more rigorous prompt without expanding its scope. The goal is depth: stronger evidence, methods, and validation on the same question—not more deliverables or adjacent work.

## Workflow

1. **Preserve the task's scope.** Identify the actual decision, question, artifact, or outcome the user wants. Do not silently broaden it. If the source task is missing, ask for it before proceeding.
2. **Diagnose the rigor gap before rewriting.** In concise, concrete terms, state:
   - **Professional standard:** What a top practitioner in the relevant field would do that the user has not requested. Prefer a missing control, comparison, uncertainty treatment, boundary condition, or adversarial check over generic advice.
   - **Raw source material:** The closest-to-primary evidence to inspect instead of relying only on summaries, dashboards, prior analyses, or other digested material. Name specific records, datasets, documents, system outputs, or observations where possible. Never imply access or availability without evidence; flag what must be obtained.
   - **Methods and tools:** Specific reproducible methods, analytical procedures, and appropriate tools. Explain what each is for; avoid tool-name decoration. Tailor these to the domain and task.
   - **Independent validation:** An observable result outside the user and assistant that could confirm or falsify the answer—e.g. a reproducible test, held-out data, authoritative source, independent reviewer, physical measurement, or operational outcome. State what passing evidence looks like and what remains unverifiable.
3. **Rewrite the prompt to request exactly that rigor.** Keep the original objective and boundaries. Add only the necessary primary evidence, methods, uncertainty/limitations, and independent validation. Do not turn the rewrite into a larger project or a generic checklist.
4. **Make the rewritten prompt usable.** Specify the desired output, evidence citations/provenance, assumptions, and a clear stop condition when appropriate. Distinguish facts from inference and unknowns. Do not claim that a validation has already happened.

## Response format

### What a top professional would add
[Specific missing professional practice.]

### Rawest material to start from
[Primary evidence and access/availability caveats.]

### Methods and tools
[Named, task-appropriate methods/tools and their purpose.]

### What would independently show it's right
[Observable external/reproducible validation and pass/fail criteria.]

### Rewritten prompt
> [A complete prompt preserving the user's original task and requesting exactly the rigor above.]

## Quality checks

- Be candid when the domain or task is too underspecified to name responsible sources or tools; ask one focused clarification only if needed.
- Do not fabricate records, source availability, credentials, tool access, or validation.
- Avoid false certainty: describe what evidence supports, contradicts, or cannot settle the conclusion.
- Keep the professional additions tied to the same question. “Deeper, not bigger” is the governing constraint.
- If the user asks only for prompt improvement, do not execute the rewritten task unless they also request execution.
