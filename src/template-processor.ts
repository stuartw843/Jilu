// Template processor for handling conditionals and placeholders

interface ProcessContext {
  transcript: string;
  personalNotes: string;
  hasPersonalNotes: boolean;
  hasTranscript: boolean;
}

/**
 * Process a template with conditionals and placeholders
 */
export function processTemplate(template: string, transcript: string, personalNotes: string): string {
  const context: ProcessContext = {
    transcript,
    personalNotes,
    hasPersonalNotes: personalNotes.trim().length > 0,
    hasTranscript: transcript.trim().length > 0,
  };

  // Process conditionals first
  let processed = processConditionals(template, context);

  // Then replace placeholders
  processed = replacePlaceholders(processed, context);

  return processed;
}

/**
 * Process conditional blocks: {{#if condition}}...{{/if}} and {{#unless condition}}...{{/unless}}
 */
function processConditionals(template: string, context: ProcessContext): string {
  let result = template;

  // Process {{#if condition}}...{{/if}} blocks
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (_match, condition, content) => {
    const value = evaluateCondition(condition, context);
    return value ? content : '';
  });

  // Process {{#unless condition}}...{{/unless}} blocks
  const unlessRegex = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  result = result.replace(unlessRegex, (_match, condition, content) => {
    const value = evaluateCondition(condition, context);
    return !value ? content : '';
  });

  return result;
}

/**
 * Evaluate a condition against the context
 */
function evaluateCondition(condition: string, context: ProcessContext): boolean {
  switch (condition) {
    case 'hasPersonalNotes':
      return context.hasPersonalNotes;
    case 'hasTranscript':
      return context.hasTranscript;
    default:
      console.warn(`Unknown condition: ${condition}`);
      return false;
  }
}

/**
 * Replace placeholders with actual values
 */
function replacePlaceholders(template: string, context: ProcessContext): string {
  let result = template;

  // Replace {transcript}
  result = result.replace(/\{transcript\}/g, context.transcript);

  // Replace {personalNotes}
  result = result.replace(/\{personalNotes\}/g, context.personalNotes);

  return result;
}

/**
 * Extract placeholder names from a template
 */
export function extractPlaceholders(template: string): string[] {
  const placeholderRegex = /\{(\w+)\}/g;
  const placeholders = new Set<string>();
  let match;

  while ((match = placeholderRegex.exec(template)) !== null) {
    placeholders.add(match[1]);
  }

  return Array.from(placeholders);
}

/**
 * Extract conditional names from a template
 */
export function extractConditionals(template: string): string[] {
  const conditionalRegex = /\{\{#(?:if|unless)\s+(\w+)\}\}/g;
  const conditionals = new Set<string>();
  let match;

  while ((match = conditionalRegex.exec(template)) !== null) {
    conditionals.add(match[1]);
  }

  return Array.from(conditionals);
}

/**
 * Validate template syntax
 */
export function validateTemplateSyntax(template: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for unclosed conditional blocks
  const ifCount = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
  const ifEndCount = (template.match(/\{\{\/if\}\}/g) || []).length;
  if (ifCount !== ifEndCount) {
    errors.push(`Mismatched {{#if}} blocks: ${ifCount} opening, ${ifEndCount} closing`);
  }

  const unlessCount = (template.match(/\{\{#unless\s+\w+\}\}/g) || []).length;
  const unlessEndCount = (template.match(/\{\{\/unless\}\}/g) || []).length;
  if (unlessCount !== unlessEndCount) {
    errors.push(`Mismatched {{#unless}} blocks: ${unlessCount} opening, ${unlessEndCount} closing`);
  }

  // Check for unknown conditionals
  const conditionals = extractConditionals(template);
  const validConditionals = ['hasPersonalNotes', 'hasTranscript'];
  conditionals.forEach(cond => {
    if (!validConditionals.includes(cond)) {
      errors.push(`Unknown conditional: ${cond}. Valid conditionals are: ${validConditionals.join(', ')}`);
    }
  });

  // Check for unknown placeholders
  const placeholders = extractPlaceholders(template);
  const validPlaceholders = ['transcript', 'personalNotes'];
  placeholders.forEach(placeholder => {
    if (!validPlaceholders.includes(placeholder)) {
      errors.push(`Unknown placeholder: {${placeholder}}. Valid placeholders are: {${validPlaceholders.join('}, {')}}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
