---
name: software-design-principles
description: "Command-only architecture review using YAGNI, DRY, KISS, SOLID, GRASP, and GoF principles. Use explicitly via slash command when requested."
disable-model-invocation: true
---

# Software Design Principles

Evaluate code against established design principles and patterns to identify violations, suggest improvements, and guide architectural decisions.

## Principles Overview

### YAGNI (You Aren't Gonna Need It)
- Don't implement features until actually needed
- Avoid speculative abstraction and premature optimization
- Reduces complexity and maintenance burden

### DRY (Don't Repeat Yourself)
- Every piece of knowledge must have a single, unambiguous representation
- Eliminate duplication of code, logic, or data
- Prefer abstraction over copy-paste

### KISS (Keep It Simple, Stupid)
- Simple solutions beat clever ones
- Favor readability and maintainability over elegance
- Avoid unnecessary abstraction layers

### SOLID
- **S**ingle Responsibility: One reason to change per module
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Subtypes must be substitutable for base types
- **I**nterface Segregation: Small, focused interfaces over large ones
- **D**ependency Inversion: Depend on abstractions, not concretions

### GRASP (General Responsibility Assignment Software Patterns)
- **Information Expert**: Assign responsibility to the class with the information
- **Creator**: Class B creates A if B contains/aggregates/records/uses A closely
- **Controller**: Handle system events, delegate to appropriate objects
- **Low Coupling**: Minimize dependencies between classes
- **High Cohesion**: Keep related responsibilities together
- **Indirection**: Introduce intermediate to decouple components
- **Polymorphism**: Use polymorphism for type-variant behavior
- **Protected Variations**: Protect elements from variations in others
- **Pure Fabrication**: Create artificial classes for cohesion/coupling benefits

### GoF Patterns (Gang of Four)

**Creational**: Factory, Abstract Factory, Builder, Singleton, Prototype
**Structural**: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy
**Behavioral**: Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor

## When to Use This Skill

- Code review: Evaluate new code against principles
- Refactoring: Identify violations and improvement opportunities
- Architecture review: Assess module boundaries and responsibilities
- Design decisions: Choose between competing approaches

## Process

### 1. Identify the Code to Evaluate

Ask the user:
- What file(s) or module(s) should be reviewed?
- Is this new code being written or existing code being refactored?
- What specific concerns prompted this review?

### 2. Analyze Against Principles

For each relevant principle, check:

**YAGNI**
- [ ] Is every implemented feature actually used?
- [ ] Are there speculative abstractions for "future needs"?
- [ ] Is there premature optimization without proven need?

**DRY**
- [ ] Is logic duplicated across files/functions?
- [ ] Is the same condition checked in multiple places?
- [ ] Are magic strings/numbers repeated?

**KISS**
- [ ] Could this be simpler and still meet requirements?
- [ ] Are there unnecessary abstraction layers?
- [ ] Is the code readable without deep domain knowledge?

**SOLID**
- [ ] Single: Does each module/class have one clear purpose?
- [ ] Open/Closed: Can behavior extend without modification?
- [ ] Liskov: Are subtypes fully substitutable?
- [ ] Interface Segregation: Are interfaces focused and minimal?
- [ ] Dependency Inversion: Do high-level modules depend on abstractions?

**GRASP**
- [ ] Is responsibility assigned to the Information Expert?
- [ ] Are creators properly assigned?
- [ ] Is coupling minimized (Low Coupling)?
- [ ] Are related responsibilities grouped (High Cohesion)?
- [ ] Are variations protected appropriately?

**GoF Patterns**
- [ ] Would a pattern solve this more elegantly?
- [ ] Is a pattern being misapplied or over-applied?
- [ ] Are anti-patterns present (God object, Singleton abuse, etc.)?

### 3. Report Findings

Present violations as a checklist with:
- **Location**: File and line range
- **Principle**: Which principle is violated
- **Severity**: Critical | Warning | Suggestion
- **Current**: Brief description of the issue
- **Recommendation**: Concrete fix or alternative approach

### 4. Prioritize Fixes

Group findings by:
1. **Immediate**: Critical violations blocking progress or causing bugs
2. **Planned**: Important issues to address in current sprint
3. **Backlog**: Suggestions for future refactoring

### 5. Apply or Document

For each fix:
- Apply directly if straightforward (with user approval)
- Document in a refactoring ticket if complex
- Provide code examples showing before/after

## Quick Reference

### Common Violations

| Principle | Common Violation | Quick Fix |
|-----------|-----------------|-----------|
| YAGNI | Unused abstractions | Inline and simplify |
| DRY | Copy-paste code | Extract function/class |
| KISS | Over-engineering | Remove layers, inline logic |
| SOLID-S | God objects | Split by responsibility |
| SOLID-O | Modifying for extension | Use strategy/polymorphism |
| SOLID-L | Subtype breaks contract | Fix inheritance or use composition |
| SOLID-I | Fat interfaces | Split into role-specific interfaces |
| SOLID-D | Direct dependency on impl | Introduce interface/dependency injection |
| GRASP | Wrong class has responsibility | Move to Information Expert |
| GoF | Pattern abuse | Remove pattern, use simple solution |

### When to Break Rules

- **YAGNI**: Break when the cost of adding later exceeds cost of adding now
- **DRY**: Break when abstraction adds more complexity than duplication
- **KISS**: Break when performance requirements demand complexity
- **SOLID**: Break for internal code unlikely to change
- **Patterns**: Break when the pattern obscures rather than clarifies

## Output Format

When reporting findings, use this structure:

```markdown
## Design Review: [Component Name]

### Summary
- Files reviewed: N
- Principles checked: YAGNI, DRY, KISS, SOLID, GRASP
- Violations found: X critical, Y warnings, Z suggestions

### Critical Issues
1. **[PRINCIPLE]** File:line - Brief description
   - Current: Code snippet or explanation
   - Fix: Specific recommendation

### Warnings
[Similar structure]

### Suggestions
[Similar structure]

### Positive Findings
[What the code does well - important for balance]
```
