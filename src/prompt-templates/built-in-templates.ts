import { PromptTemplate } from '../types';

// Built-in templates
export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default-summary',
    name: 'Default Summary',
    description: 'One-shot OpenAI summary with adaptive top-level bullets and concise sub-bullets.',
    systemPrompt:
      'You are an executive meeting summarizer. Produce notes that are scannable in under 60 seconds and still useful weeks later without replaying the meeting.',
    userPrompt: `
{{#if hasPersonalNotes}}
Incorporate these personal notes as additional signal. When personal notes overlap with transcript: use personal notes phrasing if more precise, otherwise augment transcript insights with personal note details in nested sub-bullets.
{personalNotes}
{{/if}}

## Output Rules
- Markdown bullets only
- No paragraphs, preamble, or closing text
- 3 to 8 top-level bullets total

## Structure
- 3 to 7 top-level bullets total
- Each top-level bullet represents a specific theme discussed, not a generic category
  - ✅ Good themes: "**Q4 pipeline concerns**", "**Vendor selection criteria**"
  - ❌ Bad themes: "**Discussion topics**", "**Updates**"
- Each top-level bullet:
  - Starts with a bold 2 to 5 word heading
  - Contains 2 to 5 sub-bullets

## Content Priority (highest to lowest)
1. Decisions with clear context and rationale
2. Actions with explicit owners and dates, only if stated
3. Metrics and concrete numbers (include baselines, current state, targets when mentioned)
4. Risks, blockers, dependencies
5. Open or unresolved questions
6. Downstream implications and constraints created

## Tagging
Only tag sub-bullets when the meeting created a clear new item. Make tags bold:
- **[Decision]** for explicit decisions reached in this meeting
- **[Action]** for new tasks agreed with an owner and intent
- **[Risk]** or **[Blocker]** for explicit risks or blockers raised
- Do not tag routine status updates or generic discussion

Include owners or speakers only when explicitly known. Do not reference "S1" or "S2" in the bullets. Don't assign actions to "S1" or "S2" etc.

## Organization
- Do not follow meeting chronology
- Group related discussion into logical themes
- Collapse repeated debate into a single takeaway
- Explicitly link cause and effect
- Preserve dependencies and sequencing
- Make dates explicit when possible
- Call out unclear or contradictory information

## Speaker Handling
- Use real names only if clearly mapped
- If speaker identity is ambiguous, omit attribution entirely
- Never invent identities or use labels like S1 or S2
- If a task/decision owner is only identified by a placeholder label (e.g., S1/S2/S3) and no real mapping is provided, omit the owner instead of using the placeholder

## Style
- Dense, factual, and precise
- No narrative storytelling
- Write so the notes fully stand alone for a non-attendee
- Include the "why" behind decisions, not just the "what"

## Input
Meeting transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'dynamic-note',
    name: 'Local LLM Summary',
    description: 'Auto-detects meeting themes and produces bullet-only summaries tailored to the conversation.',
    systemPrompt: 'You are a dynamic meeting note assistant. Actual prompting occurs programmatically to run multi-stage analysis.',
    userPrompt: `This template is orchestrated in code to run a multi-pass summarisation workflow. The final output must be Markdown bullets only.

Meeting Transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'action-focused',
    name: 'Action-Focused',
    description: 'Emphasizes action items, owners, and deadlines. Minimal narrative, maximum actionability.',
    systemPrompt: 'You are an expert at extracting actionable items from meetings. Focus on concrete tasks, clear ownership, and realistic deadlines. Be direct and concise. Avoid unnecessary narrative.',
    userPrompt: `Extract actionable items from this meeting with clear ownership and deadlines.

{{#if hasPersonalNotes}}
Consider both the transcript and personal notes for complete context:

Personal Notes:
{personalNotes}
{{/if}}

Create these sections:

## 🎯 Key Decisions
List each decision with a one-line rationale (maximum 5 decisions):
- Decision: Brief rationale

## ✅ Action Items
Format each as a checkbox with owner, deadline, and priority:
- [ ] Task description (Owner: name, Due: date, Priority: High/Medium/Low)

Derive priority from the discussion context and urgency implied.

## 🔍 Open Questions
List blockers and unresolved issues requiring follow-up:
- Question or blocker

## 📅 Next Meeting
Agenda items for the next meeting:
- Topic to discuss

Be direct. Skip narrative. Focus on actionability.

Meeting Transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'decision-log',
    name: 'Decision Log',
    description: 'Focuses on decisions made and their rationale. Tracks who made decisions and context.',
    systemPrompt: 'You are an expert at documenting decisions and their context. Focus on capturing the reasoning, alternatives considered, and people involved. Be precise about decision details.',
    userPrompt: `Document all decisions made in this meeting with full context.

{{#if hasPersonalNotes}}
Personal Notes:
{personalNotes}
{{/if}}

Create a structured decision log:

## Executive Summary
Deliver a markdown bullet outline (no paragraphs) that captures:
- **Headline outcomes**: Key decisions or results (tag with [Decision] when appropriate)
- **Risks & blockers**: Issues needing attention (tag with [Blocker])
- **Critical follow-ups**: Owners and timelines that require immediate focus
Use nested bullets to capture supporting rationale or context.

## Decisions Made

For each decision, provide:

### Decision [Number]: [Brief title]
- **What was decided**: Clear statement of the decision
- **Who decided**: Key decision-makers involved
- **Why**: Rationale and reasoning
- **Alternatives considered**: Other options discussed
- **Impact**: Expected outcomes and affected parties
- **Next steps**: Immediate actions resulting from this decision

## Deferred Decisions
Decisions that were discussed but postponed:
- Topic: Reason for deferral, Expected timeline

## Context & Background
Relevant background information that informed the decisions.

## Follow-up Required
- Actions needed to implement decisions
- Additional information or approval required

Maintain precision and completeness in documenting each decision.

Meeting Transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'technical-discussion',
    name: 'Technical Discussion',
    description: 'Preserves technical details, code references, and architecture discussions. Best for engineering meetings.',
    systemPrompt: 'You are an expert at documenting technical discussions. Preserve technical terminology, architecture details, code references, and implementation specifics. Be precise with technical concepts.',
    userPrompt: `Document this technical meeting with attention to technical details.

{{#if hasPersonalNotes}}
Personal Notes:
{personalNotes}
{{/if}}

Create technical documentation with these sections:

## Overview
Provide a bullet-style snapshot (no paragraphs) covering:
- **Context & goals**: Problem statement and why it matters
- **Key updates**: Major technical insights or decisions with speaker attribution
- **Outstanding risks**: Open questions, blockers, or dependencies
Use nested sub-bullets to capture implementation nuances.

## Technical Details
Preserve all technical information including:
- Architecture decisions and patterns
- Code references, file names, function names
- Technical terminology and concepts
- Performance considerations
- Security implications

## Solutions & Approaches
Document proposed solutions:
- **Problem**: Description
- **Proposed Solution**: Technical approach
- **Pros**: Advantages
- **Cons**: Disadvantages and trade-offs
- **Decision**: What was chosen and why

## Implementation Notes
- Technical requirements
- Dependencies and prerequisites
- Integration points
- Testing approach

## Technical Decisions
- Key architectural or implementation decisions
- Rationale for technical choices
- Alternatives considered

## Action Items
- [ ] Technical tasks (Owner: name, Priority: High/Medium/Low)

## Open Technical Questions
- Unresolved technical issues
- Areas requiring further research
- Technical risks identified

Preserve accuracy of all technical terms, code references, and implementation details.

Meeting Transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'executive-summary',
    name: 'Concise Executive Summary',
    description: 'Brief, high-level summary. Key points only, no detailed sections. Perfect for status updates.',
    systemPrompt: 'You are an expert at creating concise executive summaries. Focus on the most critical information. Be brief but ensure nothing important is lost. Use bullet points and clear language.',
    userPrompt: `Create a concise executive summary of this meeting.

{{#if hasPersonalNotes}}
Personal Notes:
{personalNotes}
{{/if}}

Keep it brief and focused. Structure:

## Executive Summary
2-3 sentences capturing the essence of the meeting.

## Key Takeaways
- 3-5 bullet points of the most important information
- Focus on what matters to executives and decision-makers

## Critical Decisions
- Only the most significant decisions (maximum 3)

## Priority Actions
- Top 3-5 action items only
- Format: Task (Owner, Due date)

## Risks & Concerns
- Only critical risks that require attention
- One line per risk

## Bottom Line
One sentence summarizing the overall status or outcome.

Be extremely concise. Each section should be scannable in seconds.

Meeting Transcript:
{transcript}`,
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
