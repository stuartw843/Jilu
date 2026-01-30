import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Blockquote from "@tiptap/extension-blockquote";
import { marked } from "marked";
import { elements } from "../../dom";
import { getCurrentMeeting, updateMeetingInList } from "../../state";
import { renderEnhancedNotes, normalizeMarkdown } from "../../utils";
import { updateEnhancedCopyButtonState } from "../../ai-operations";
import { db } from "../../database";
import { setupToolbar } from "./toolbar";

let enhancedNotesEditor: Editor | null = null;

// Enhanced Notes Editing
export function startEditingEnhanced() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting || !elements.enhancedContent) return;
  
  // Hide the content viewer
  const contentViewer = elements.enhancedContent.parentElement;
  if (contentViewer) {
    contentViewer.style.display = 'none';
  }
  
  // Show the editor container
  const editorContainer = document.getElementById('enhanced-editor-container');
  const enhancedEditorElement = document.getElementById('enhanced-tiptap-editor');
  
  if (editorContainer && enhancedEditorElement) {
    editorContainer.style.display = 'block';
    
    // Destroy existing enhanced editor if it exists
    if (enhancedNotesEditor) {
      try {
        enhancedNotesEditor.destroy();
      } catch (e) {
        console.error('Error destroying enhanced editor:', e);
      }
      enhancedNotesEditor = null;
    }
    
    // Convert markdown to HTML for editing
    const htmlContent = marked.parse(normalizeMarkdown(currentMeeting.enhancedNotes)) as string;
    
    // Initialize TipTap editor for enhanced notes
    enhancedNotesEditor = new Editor({
      element: enhancedEditorElement,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Blockquote,
        Placeholder.configure({
          placeholder: 'Edit your enhanced notes here...',
        }),
      ],
      content: htmlContent,
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content',
        },
      },
    });

    // Setup toolbar for enhanced notes
    setupToolbar('enhanced-toolbar', enhancedNotesEditor);
  }
  
  // Show save/cancel buttons
  const editBtn = document.getElementById('edit-enhanced-btn');
  const saveBtn = document.getElementById('save-enhanced-btn');
  const cancelBtn = document.getElementById('cancel-enhanced-btn');
  
  if (editBtn) editBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'inline-block';
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
}

export async function saveEditedEnhanced() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting || !enhancedNotesEditor) return;
  
  // Get HTML content from editor
  const html = enhancedNotesEditor.getHTML();
  currentMeeting.enhancedNotes = html;
  currentMeeting.updatedAt = new Date();
  await db.saveMeeting(currentMeeting);
  
  // Update the meetings array
  updateMeetingInList(currentMeeting);
  
  exitEditingEnhanced();
  
  if (elements.enhancedContent) {
    renderEnhancedNotes(currentMeeting.enhancedNotes, elements.enhancedContent);
  }

  updateEnhancedCopyButtonState();
}

export function cancelEditedEnhanced() {
  exitEditingEnhanced();
}

function exitEditingEnhanced() {
  // Destroy enhanced editor
  if (enhancedNotesEditor) {
    try {
      enhancedNotesEditor.destroy();
    } catch (e) {
      console.error('Error destroying enhanced editor:', e);
    }
    enhancedNotesEditor = null;
  }
  
  // Hide editor container
  const editorContainer = document.getElementById('enhanced-editor-container');
  if (editorContainer) {
    editorContainer.style.display = 'none';
  }
  
  // Show content viewer
  const contentViewer = elements.enhancedContent?.parentElement;
  if (contentViewer) {
    contentViewer.style.display = 'block';
  }
  
  // Show/hide buttons
  const editBtn = document.getElementById('edit-enhanced-btn');
  const saveBtn = document.getElementById('save-enhanced-btn');
  const cancelBtn = document.getElementById('cancel-enhanced-btn');
  
  if (editBtn) editBtn.style.display = 'inline-block';
  if (saveBtn) saveBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// Expose functions to window for onclick handlers
(window as any).startEditingEnhanced = startEditingEnhanced;
(window as any).saveEditedEnhanced = saveEditedEnhanced;
(window as any).cancelEditedEnhanced = cancelEditedEnhanced;
