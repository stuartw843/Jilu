// Re-export all template functionality from submodules
export { BUILT_IN_TEMPLATES } from './built-in-templates.ts';
export {
  initializeTemplates,
  getAllTemplates,
  getTemplate,
  getDefaultTemplateId,
  setDefaultTemplateId,
  saveTemplate,
  deleteTemplate,
  duplicateTemplate,
  resetToDefaults,
} from './template-storage.ts';
export { validateTemplate } from './template-validation.ts';
