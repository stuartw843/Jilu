// Re-export all editor functionality from submodules
export { setupToolbar, updateToolbarButtons } from './toolbar.ts';
export { initializeNotesEditor, getNotesContent } from './personal-notes-editor.ts';
export {
  startEditingEnhanced,
  saveEditedEnhanced,
  cancelEditedEnhanced,
} from './enhanced-notes-editor.ts';
