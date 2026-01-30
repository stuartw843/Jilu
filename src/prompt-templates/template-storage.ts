import { PromptTemplate } from '../types';
import { BUILT_IN_TEMPLATES } from './built-in-templates';

const STORAGE_KEY = 'prompt_templates';
const DEFAULT_TEMPLATE_KEY = 'default_template_id';
const VERSION_KEY = 'templates_version';
const CURRENT_VERSION = 1;
const DEFAULT_TEMPLATE_ID = 'default-summary';

// Initialize templates on first use
export function initializeTemplates(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  const builtInIds = new Set(BUILT_IN_TEMPLATES.map((template) => template.id));
  
  if (!stored) {
    // First time - save built-in templates
    localStorage.setItem(STORAGE_KEY, JSON.stringify(BUILT_IN_TEMPLATES));
    localStorage.setItem(DEFAULT_TEMPLATE_KEY, DEFAULT_TEMPLATE_ID);
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION.toString());
  } else {
    // Check if we need to update built-in templates
    let templates = JSON.parse(stored) as PromptTemplate[];
    let needsUpdate = false;

    // Remove deprecated built-in templates that no longer exist
    const filteredTemplates = templates.filter(
      (template) => !template.isBuiltIn || builtInIds.has(template.id)
    );
    if (filteredTemplates.length !== templates.length) {
      templates = filteredTemplates;
      needsUpdate = true;
    }
    
    // Update or add built-in templates
    BUILT_IN_TEMPLATES.forEach(builtIn => {
      const existing = templates.find(t => t.id === builtIn.id);
      if (!existing) {
        templates.push(builtIn);
        needsUpdate = true;
      } else if (existing.isBuiltIn) {
        // Update built-in template content (preserve user edits to custom templates)
        const index = templates.indexOf(existing);
        templates[index] = { ...builtIn, updatedAt: Date.now() };
        needsUpdate = true;
      }
    });
    
    // Ensure a valid default template is set
    const currentDefault = localStorage.getItem(DEFAULT_TEMPLATE_KEY);
    const hasValidDefault = currentDefault && templates.some((template) => template.id === currentDefault);
    if (!hasValidDefault) {
      localStorage.setItem(DEFAULT_TEMPLATE_KEY, DEFAULT_TEMPLATE_ID);
    }

    if (needsUpdate) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }
  }
}

// Get all templates
export function getAllTemplates(): PromptTemplate[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    initializeTemplates();
    return BUILT_IN_TEMPLATES;
  }
  return JSON.parse(stored) as PromptTemplate[];
}

// Get a specific template by ID
export function getTemplate(id: string): PromptTemplate | null {
  const templates = getAllTemplates();
  return templates.find(t => t.id === id) || null;
}

// Get the default template ID
export function getDefaultTemplateId(): string {
  const storedDefault = localStorage.getItem(DEFAULT_TEMPLATE_KEY);
  const templates = getAllTemplates();
  if (storedDefault && templates.some((template) => template.id === storedDefault)) {
    return storedDefault;
  }
  return DEFAULT_TEMPLATE_ID;
}

// Set the default template ID
export function setDefaultTemplateId(id: string): void {
  localStorage.setItem(DEFAULT_TEMPLATE_KEY, id);
}

// Save a template (create or update)
export function saveTemplate(template: PromptTemplate): void {
  const templates = getAllTemplates();
  const index = templates.findIndex(t => t.id === template.id);
  
  if (index >= 0) {
    // Update existing
    templates[index] = { ...template, updatedAt: Date.now() };
  } else {
    // Create new
    templates.push({ ...template, createdAt: Date.now(), updatedAt: Date.now() });
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

// Delete a template (only custom templates)
export function deleteTemplate(id: string): boolean {
  const templates = getAllTemplates();
  const template = templates.find(t => t.id === id);
  
  if (!template || template.isBuiltIn) {
    return false; // Cannot delete built-in templates
  }
  
  const filtered = templates.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  
  // If this was the default, reset to the built-in default
  if (getDefaultTemplateId() === id) {
    setDefaultTemplateId(DEFAULT_TEMPLATE_ID);
  }
  
  return true;
}

// Create a copy of a template
export function duplicateTemplate(id: string, newName: string): PromptTemplate | null {
  const original = getTemplate(id);
  if (!original) return null;
  
  const duplicate: PromptTemplate = {
    ...original,
    id: `custom-${Date.now()}`,
    name: newName,
    isBuiltIn: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  saveTemplate(duplicate);
  return duplicate;
}

// Reset all templates to defaults (removes custom templates)
export function resetToDefaults(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(BUILT_IN_TEMPLATES));
  localStorage.setItem(DEFAULT_TEMPLATE_KEY, DEFAULT_TEMPLATE_ID);
}
