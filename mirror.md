# Mirror

_Read this six months from now._

## What you actually believe

You believe correctness must be earned twice. After an agent says done, you ask for another review and then CI. The archive contains 673 review messages, 933 debugging messages, and 722 testing messages. (Evidence: `evidence.md`, role-aware sweep; Interview Q1 and Q4.)

You do not trust a first pass. That makes you careful. It also makes done a moving target.

## How your thinking moves

You are fast at finding structure. You reach for architecture, orchestration, tooling, parallel work, and adversarial review. The archive contains 747 agent-tooling messages, 200 security messages, and 143 performance messages. (Evidence: role-aware topic counts.)

You loop at the trust boundary. The sequence is build or fix, inspect, review, fix again, test, review again. The archive records 21 correction-language matches across 16 dates and 34 deliberation-language matches across 23 dates. (Evidence: full role-aware grep sweep.)

## What you are good at

You are good at forensic software work. You look for failure modes. You ask for architectural debt reviews. You care about security, tests, and hidden interactions. (Evidence: Interview Q3; security 200; testing 722; review 673.)

You are good at building leverage systems. You do not merely use tools. You redesign the machinery around the tools. Herdr dispatch is one example. (Evidence: Interview Q5.)

## What you avoid

You avoid the irreversible moment: the point where work must be named as shipped, to a named user, on a named date.

Your last three tasks were not cleanly enumerated. One was merged. Another was merged or in review. The third was not recalled. When asked what the tooling improvement put in another person's hands, the answer was: “for now just code improvements.” (Evidence: Interview Q2 and Q5.)

The record does not prove that nothing ships. It proves that shipped status is not reliably remembered or linked to a user. That is a delivery problem, not a coding problem.

## The thing you may not know about yourself

You are using agents not only to write software, but to make uncertainty manageable. Every new review, skill, pane, worktree, test pass, and architecture pass gives uncertainty another surface to inspect. The machinery improves. The final proof remains vague.

(Evidence: agent tooling 747 versus no specific user-facing outcome in Interview Q5; repeated verification in Interview Q4.)

## The hardest truth

You have made scrutiny safer than commitment.

Until “shipped to a named user” becomes the finish line, every improvement to your agent system can increase your ability to postpone it.

## Confidence and limits

The strong findings are the review loop, verification habit, and tooling/output gap. The archive was mined through a bounded 45-file sample plus role-aware sweeps of Claude, Codex, and Pi records. Delivery conclusions are lower-confidence because final user states were not consistently recorded. This is a description of the record, not a diagnosis.
