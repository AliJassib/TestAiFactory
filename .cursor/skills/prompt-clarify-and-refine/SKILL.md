---
name: prompt-clarify-and-refine
description: Clarifies ambiguous user requests with short multiple-choice questions until intent is clear, then outputs a polished professional prompt. When intent is already clear, outputs that polished prompt directly without extra rounds. Use when the user wants better prompts, help writing prompts, refinement for LLMs, or when their message is vague, incomplete, or could mean several things—including Arabic or mixed-language requests.
---

# Prompt clarify and refine

## When to use which path

**Path A — Ambiguous or underspecified**

Apply when any of these hold: goal unclear; several valid interpretations; missing audience, format, constraints, or success criteria; contradictory hints; very short one-liners that need scope.

**Path B — Clear enough**

Apply when the user states a concrete deliverable, audience, and constraints, or a single obvious interpretation fits. Skip long interrogations; you may ask **at most one** closing question if a single critical detail is still missing (optional checkbox or two options).

---

## Path A: Clarify with choices

1. **Infer 2–4 plausible readings** of what they want. Do not list them as a wall of text; turn uncertainty into **questions**.
2. For each question, offer **2–4 mutually exclusive options** (radio-style), plus one **“Other / explain in chat”** when useful.
3. Keep each round **small**: prefer **1–2 questions per message** (max 3 if tightly related). Offer a **“Skip / use your best guess”** on non-critical items so the user can move on.
4. After they answer, **either** ask another focused round **or** stop when you can state their goal in one precise sentence.
5. **Then** output the final artifact: a **professional prompt** ready to paste into an LLM (clear role, context, task, constraints, output format, edge cases). Match the **language of the final prompt** to what they need (e.g. Arabic prompt for Arabic output if they asked for that).

**Format for choice questions (use every time in Path A):**

```markdown
**سؤال [N]:** [سطر واحد يوضح ماذا تقصد]

- **أ)** ...
- **ب)** ...
- **ج)** ...
- **د)** أخرى — اشرح في رسالة قصيرة

_أو اختر: تخطّى / قرّب أنت_
```

If the user wrote in English, use English labels (A/B/C/D, “Other”, “Skip / you decide”).

---

## Path B: Refine only

1. Briefly **restate the goal in one line** (optional, for alignment).
2. Deliver **one** polished prompt: sections for role, context, task, constraints, desired output shape, and tone. No interview unless one detail would materially change the result.

---

## Quality bar for the final prompt

- **Specific**: who/what/when/format/length/evidence.
- **Actionable**: ordered steps or bullet structure the model can follow.
- **Safe**: note privacy, no invented facts; ask for citations or “say unknown” if relevant.
- **Measurable**: what “done” looks like.

---

## Anti-patterns

- Do not ask open-ended “what do you mean?” without options when Path A applies.
- Do not repeat the same question in different words.
- Do not add Path A rounds once Path B clearly applies.
