import { PromptTemplate } from '../types';

// Validate template has required fields
export function validateTemplate(template: Partial<PromptTemplate>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!template.name || template.name.trim().length === 0) {
    errors.push('Template name is required');
  }
  
  if (!template.description || template.description.trim().length === 0) {
    errors.push('Template description is required');
  }
  
  if (!template.systemPrompt || template.systemPrompt.trim().length === 0) {
    errors.push('System prompt is required');
  }
  
  if (!template.userPrompt || template.userPrompt.trim().length === 0) {
    errors.push('User prompt is required');
  }
  
  // Check for required placeholders
  if (template.userPrompt && !template.userPrompt.includes('{transcript}')) {
    errors.push('User prompt must include {transcript} placeholder');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
