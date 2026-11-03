#!/usr/bin/env node
// Repository entrypoint; keep one canonical adapter in the portable skill.
import { main } from '../skills/skill-diet/scripts/skill_eval_pi.mjs';
await main();
