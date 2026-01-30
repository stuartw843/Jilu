import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Blockquote from "@tiptap/extension-blockquote";
import { getCurrentMeeting } from "../../state";
import { debounce } from "../../utils";
import { setupToolbar } from "./toolbar";
import { saveMeetingChanges } from "../../meeting-operations";

let notesEditor: Editor | null = null;

// Personal Notes Editor
export function initializeNotesEditor(initialContent: string = '') {
  const editorContainer = document.getElementById('tiptap-editor');
  if (!editorContainer) return;

  // Destroy existing editor if it exists
  if (notesEditor) {
    try {
      notesEditor.destroy();
    } catch (e) {
      console.error('Error destroying editor:', e);
    }
    notesEditor = null;
  }

  // Initialize Tiptap Editor
  notesEditor = new Editor({
    element: editorContainer,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Blockquote,
      Placeholder.configure({
        placeholder: 'Take your personal notes here during the meeting... Try typing # for headings, * for bold, or - for lists',
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content',
      },
    },
    onUpdate: debounce(async () => {
      const currentMeeting = getCurrentMeeting();
      if (currentMeeting && notesEditor) {
        // Get HTML content from editor
        const html = notesEditor.getHTML();
        currentMeeting.personalNotes = html;
        
        saveMeetingChanges();
      }
    }, 1000),
  });

  // Setup toolbar for personal notes
  setupToolbar('editor-toolbar', notesEditor);
}

export function getNotesContent(): string {
  if (notesEditor) {
    return notesEditor.getHTML();
  }
  const currentMeeting = getCurrentMeeting();
  return currentMeeting?.personalNotes || '';
}
