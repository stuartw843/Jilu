import { elements } from '../dom';
import {
  getAllTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  duplicateTemplate,
  resetToDefaults,
  validateTemplate,
  getDefaultTemplateId,
} from '../prompt-templates';
import { validateTemplateSyntax } from '../template-processor';
import { PromptTemplate } from '../types';
import { escapeHtml } from '../utils/html';
import { showToast } from './interactions';

let currentEditingTemplate: PromptTemplate | null = null;
let isCreatingNew = false;

export function openTemplateManager() {
  elements.templateManagerModal?.classList.add('active');
  loadTemplateList();
  clearEditor();
}

export function closeTemplateManager() {
  elements.templateManagerModal?.classList.remove('active');
  currentEditingTemplate = null;
  isCreatingNew = false;
}

function loadTemplateList() {
  if (!elements.templateList) return;

  const templates = getAllTemplates();
  const builtInTemplates = templates.filter(t => t.isBuiltIn);
  const customTemplates = templates.filter(t => !t.isBuiltIn);

  let html = '<div class="template-categories">';

  // Built-in templates
  html += '<div class="template-category">';
  html += '<h3>⭐ Built-in Templates</h3>';
  html += '<div class="template-items">';
  
  builtInTemplates.forEach(template => {
    const isActive = currentEditingTemplate?.id === template.id;
    const safeId = escapeHtml(template.id);
    const safeName = escapeHtml(template.name);
    const safeDescription = escapeHtml(template.description);
    html += `
      <div class="template-item ${isActive ? 'active' : ''}" data-template-id="${safeId}">
        <div class="template-item-header">
          <strong>${safeName}</strong>
        </div>
        <p class="template-item-description">${safeDescription}</p>
      </div>
    `;
  });
  
  html += '</div></div>';

  // Custom templates
  if (customTemplates.length > 0) {
    html += '<div class="template-category">';
    html += '<h3>🎨 Custom Templates</h3>';
    html += '<div class="template-items">';
    
    customTemplates.forEach(template => {
      const isActive = currentEditingTemplate?.id === template.id;
      const safeId = escapeHtml(template.id);
      const safeName = escapeHtml(template.name);
      const safeDescription = escapeHtml(template.description);
      html += `
        <div class="template-item ${isActive ? 'active' : ''}" data-template-id="${safeId}">
          <div class="template-item-header">
            <strong>${safeName}</strong>
          </div>
          <p class="template-item-description">${safeDescription}</p>
        </div>
      `;
    });
    
    html += '</div></div>';
  }

  html += '</div>';

  elements.templateList.innerHTML = html;

  // Add click listeners
  const templateItems = elements.templateList.querySelectorAll('.template-item');
  templateItems.forEach(item => {
    item.addEventListener('click', () => {
      const templateId = item.getAttribute('data-template-id');
      if (templateId) {
        loadTemplateForViewing(templateId);
      }
    });
  });
}

function loadTemplateForViewing(templateId: string) {
  const template = getTemplate(templateId);
  if (!template) return;

  currentEditingTemplate = template;
  isCreatingNew = false;
  
  displayTemplateView(template);
  loadTemplateList(); // Refresh to update active state
}

function displayTemplateView(template: PromptTemplate) {
  if (!elements.templateEditor) return;

  const safeName = escapeHtml(template.name);
  const safeDescription = escapeHtml(template.description);
  const safeSystem = escapeHtml(template.systemPrompt);
  const safeUser = escapeHtml(template.userPrompt);

  const html = `
    <div class="template-view-mode">
      <div class="template-header">
        <div>
          <h2>${safeName}</h2>
          <p class="template-description">${safeDescription}</p>
          ${template.isBuiltIn ? '<span class="badge badge-builtin">Built-in</span>' : '<span class="badge badge-custom">Custom</span>'}
        </div>
        <div class="template-actions">
          <button class="btn btn-secondary btn-small" id="edit-template-btn">✏️ Edit</button>
          <button class="btn btn-secondary btn-small" id="copy-template-btn">📋 Copy</button>
          ${!template.isBuiltIn ? '<button class="btn btn-danger btn-small" id="delete-template-btn">🗑️ Delete</button>' : ''}
        </div>
      </div>

      <div class="template-content">
        <div class="template-section">
          <h4>System Prompt</h4>
          <div class="template-preview">${safeSystem}</div>
          <small class="char-count">${template.systemPrompt.length} characters</small>
        </div>

        <div class="template-section">
          <h4>User Prompt</h4>
          <div class="template-preview">${safeUser}</div>
          <small class="char-count">${template.userPrompt.length} characters</small>
        </div>

        <div class="template-section">
          <h4>Placeholders & Conditionals</h4>
          <div class="template-info">
            <p><strong>Placeholders:</strong></p>
            <ul>
              <li><code>{transcript}</code> - Meeting transcript</li>
              <li><code>{personalNotes}</code> - Personal notes</li>
            </ul>
            <p><strong>Conditionals:</strong></p>
            <ul>
              <li><code>{{#if hasPersonalNotes}}...{{/if}}</code> - Show only if personal notes exist</li>
              <li><code>{{#unless hasPersonalNotes}}...{{/unless}}</code> - Show only if no personal notes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

    elements.templateEditor.innerHTML = html;

  // Add event listeners
  document.getElementById('edit-template-btn')?.addEventListener('click', () => {
    displayTemplateEditMode(template);
  });

  document.getElementById('copy-template-btn')?.addEventListener('click', () => {
    copyTemplate(template);
  });

  document.getElementById('delete-template-btn')?.addEventListener('click', () => {
    deleteTemplateWithConfirm(template.id);
  });
}

function displayTemplateEditMode(template: PromptTemplate) {
  if (!elements.templateEditor) return;

  const html = `
    <div class="template-edit-mode">
      <div class="template-header">
        <h2>${isCreatingNew ? 'New Template' : 'Edit Template'}</h2>
        <div class="template-actions">
          <button class="btn btn-primary btn-small" id="save-template-btn">💾 Save</button>
          <button class="btn btn-secondary btn-small" id="cancel-edit-btn">✖️ Cancel</button>
        </div>
      </div>

      <div class="template-form">
        <div class="form-group">
          <label for="template-name">Template Name</label>
          <input 
            type="text" 
            id="template-name" 
            class="form-input" 
            value="${escapeHtml(template.name)}"
            ${template.isBuiltIn && !isCreatingNew ? 'disabled' : ''}
            placeholder="Enter template name..."
          />
        </div>

        <div class="form-group">
          <label for="template-description">Description</label>
          <textarea 
            id="template-description" 
            class="form-textarea" 
            rows="2"
            placeholder="Describe what this template is for..."
          >${escapeHtml(template.description)}</textarea>
        </div>

        <div class="form-group">
          <label for="template-system-prompt">System Prompt</label>
          <textarea 
            id="template-system-prompt" 
            class="form-textarea" 
            rows="4"
            placeholder="Instructions for the AI assistant..."
          >${escapeHtml(template.systemPrompt)}</textarea>
          <small class="char-count"><span id="system-char-count">${template.systemPrompt.length}</span> characters</small>
        </div>

        <div class="form-group">
          <label for="template-user-prompt">User Prompt</label>
          <textarea 
            id="template-user-prompt" 
            class="form-textarea" 
            rows="12"
            placeholder="Main prompt template with {transcript} and {personalNotes} placeholders..."
          >${escapeHtml(template.userPrompt)}</textarea>
          <small class="char-count"><span id="user-char-count">${template.userPrompt.length}</span> characters</small>
        </div>

        <div class="template-help">
          <h4>Help</h4>
          <p><strong>Placeholders:</strong> <code>{transcript}</code>, <code>{personalNotes}</code></p>
          <p><strong>Conditionals:</strong> <code>{{#if hasPersonalNotes}}...{{/if}}</code>, <code>{{#unless hasPersonalNotes}}...{{/unless}}</code></p>
        </div>

        <div id="validation-errors" class="validation-errors" style="display: none;"></div>
      </div>
    </div>
  `;

  elements.templateEditor.innerHTML = html;

  // Add character count listeners
  const systemPromptInput = document.getElementById('template-system-prompt') as HTMLTextAreaElement;
  const userPromptInput = document.getElementById('template-user-prompt') as HTMLTextAreaElement;

  systemPromptInput?.addEventListener('input', (e) => {
    const count = (e.target as HTMLTextAreaElement).value.length;
    const countEl = document.getElementById('system-char-count');
    if (countEl) countEl.textContent = count.toString();
  });

  userPromptInput?.addEventListener('input', (e) => {
    const count = (e.target as HTMLTextAreaElement).value.length;
    const countEl = document.getElementById('user-char-count');
    if (countEl) countEl.textContent = count.toString();
  });

  // Add event listeners
  document.getElementById('save-template-btn')?.addEventListener('click', () => {
    saveCurrentTemplate();
  });

  document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
    if (currentEditingTemplate && !isCreatingNew) {
      displayTemplateView(currentEditingTemplate);
    } else {
      clearEditor();
    }
  });
}

function saveCurrentTemplate() {
  const nameInput = document.getElementById('template-name') as HTMLInputElement;
  const descriptionInput = document.getElementById('template-description') as HTMLTextAreaElement;
  const systemPromptInput = document.getElementById('template-system-prompt') as HTMLTextAreaElement;
  const userPromptInput = document.getElementById('template-user-prompt') as HTMLTextAreaElement;

  if (!nameInput || !descriptionInput || !systemPromptInput || !userPromptInput) return;

  const templateData: Partial<PromptTemplate> = {
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim(),
    systemPrompt: systemPromptInput.value.trim(),
    userPrompt: userPromptInput.value.trim(),
  };

  // Validate
  const validation = validateTemplate(templateData);
  const syntaxValidation = validateTemplateSyntax(templateData.userPrompt || '');

  const allErrors = [...validation.errors, ...syntaxValidation.errors];

  if (allErrors.length > 0) {
    showValidationErrors(allErrors);
    return;
  }

  // Create or update template
  const template: PromptTemplate = {
    id: currentEditingTemplate?.id || `custom-${Date.now()}`,
    name: templateData.name!,
    description: templateData.description!,
    systemPrompt: templateData.systemPrompt!,
    userPrompt: templateData.userPrompt!,
    isBuiltIn: currentEditingTemplate?.isBuiltIn || false,
    createdAt: currentEditingTemplate?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  saveTemplate(template);
  currentEditingTemplate = template;
  isCreatingNew = false;

  // Refresh UI
  loadTemplateList();
  displayTemplateView(template);

  // Show success message
  showSuccessMessage('Template saved successfully!');

  // Refresh template selectors in the app
  refreshTemplateSelectors();
}

function showValidationErrors(errors: string[]) {
  const errorContainer = document.getElementById('validation-errors');
  if (!errorContainer) return;

  errorContainer.innerHTML = `
    <h4>Validation Errors:</h4>
    <ul>
      ${errors.map(err => `<li>${escapeHtml(err)}</li>`).join('')}
    </ul>
  `;
  errorContainer.style.display = 'block';
}

function clearEditor() {
  if (!elements.templateEditor) return;

  elements.templateEditor.innerHTML = `
    <div class="template-empty-state">
      <h3>Select a template to view or edit</h3>
      <p>Choose a template from the list on the left, or create a new one.</p>
    </div>
  `;
}

function copyTemplate(template: PromptTemplate) {
  const newName = prompt(`Enter a name for the copy:`, `${template.name} (Copy)`);
  if (!newName) return;

  const duplicate = duplicateTemplate(template.id, newName);
  if (duplicate) {
    loadTemplateList();
    loadTemplateForViewing(duplicate.id);
    showSuccessMessage('Template copied successfully!');
    refreshTemplateSelectors();
  }
}

async function deleteTemplateWithConfirm(templateId: string) {
  const template = getTemplate(templateId);
  if (!template) return;

  const userConfirmed = await Promise.resolve(confirm(`Are you sure you want to delete "${template.name}"? This cannot be undone.`));
  if (userConfirmed) {
    const success = deleteTemplate(templateId);
    if (success) {
      clearEditor();
      loadTemplateList();
      showSuccessMessage('Template deleted successfully!');
      refreshTemplateSelectors();
    } else {
      showToast('Cannot delete built-in templates.', { type: "warning" });
    }
  }
}

export function createNewTemplate() {
  isCreatingNew = true;
  currentEditingTemplate = {
    id: `custom-${Date.now()}`,
    name: '',
    description: '',
    systemPrompt: '',
    userPrompt: '',
    isBuiltIn: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  displayTemplateEditMode(currentEditingTemplate);
}

export async function resetTemplates() {
  const userConfirmed = await Promise.resolve(confirm('Reset all templates to defaults? This will delete all custom templates. This cannot be undone.'));
  if (userConfirmed) {
    resetToDefaults();
    clearEditor();
    loadTemplateList();
    showSuccessMessage('Templates reset to defaults!');
    refreshTemplateSelectors();
  }
}

function showSuccessMessage(message: string) {
  // Simple alert for now, could be replaced with a toast notification
  const alertDiv = document.createElement('div');
  alertDiv.className = 'success-toast';
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.remove();
  }, 3000);
}

// Refresh template selectors throughout the app
function refreshTemplateSelectors() {
  // This will be called by settings.ts and other modules that display template selectors
  if (elements.defaultTemplateSelect) {
    loadTemplateOptions(elements.defaultTemplateSelect);
  }
  if (elements.templateSelector) {
    loadTemplateOptions(elements.templateSelector);
  }
}

export function loadTemplateOptions(selectElement: HTMLSelectElement) {
  const templates = getAllTemplates();
  const currentValue = selectElement.value;

  selectElement.innerHTML = '';

  // Add built-in templates
  const builtInGroup = document.createElement('optgroup');
  builtInGroup.label = '⭐ Built-in Templates';
  templates.filter(t => t.isBuiltIn).forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    builtInGroup.appendChild(option);
  });
  selectElement.appendChild(builtInGroup);

  // Add custom templates if any
  const customTemplates = templates.filter(t => !t.isBuiltIn);
  if (customTemplates.length > 0) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = '🎨 Custom Templates';
    customTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      customGroup.appendChild(option);
    });
    selectElement.appendChild(customGroup);
  }

  // Restore previous selection if it still exists
  if (currentValue && templates.find(t => t.id === currentValue)) {
    selectElement.value = currentValue;
  } else {
    selectElement.value = getDefaultTemplateId();
  }
}

export function setupTemplateManagerListeners() {
  elements.closeTemplateManagerBtn?.addEventListener('click', closeTemplateManager);
  elements.newTemplateBtn?.addEventListener('click', createNewTemplate);

  // Close on outside click
  elements.templateManagerModal?.addEventListener('click', (e) => {
    if (e.target === elements.templateManagerModal) {
      closeTemplateManager();
    }
  });
}
