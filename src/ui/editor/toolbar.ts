import { Editor } from "@tiptap/core";

// Toolbar Setup
export function setupToolbar(toolbarId: string, editor: Editor) {
  const toolbar = document.getElementById(toolbarId);
  if (!toolbar) return;

  const buttons = toolbar.querySelectorAll('.toolbar-btn');
  
  buttons.forEach((button) => {
    const action = (button as HTMLElement).dataset.action;
    if (!action) return;

    button.addEventListener('click', (e) => {
      e.preventDefault();
      
      switch (action) {
        case 'bold':
          editor.chain().focus().toggleBold().run();
          break;
        case 'italic':
          editor.chain().focus().toggleItalic().run();
          break;
        case 'heading1':
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          break;
        case 'heading2':
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          break;
        case 'heading3':
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          break;
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run();
          break;
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run();
          break;
        case 'code':
          editor.chain().focus().toggleCode().run();
          break;
        case 'undo':
          editor.chain().focus().undo().run();
          break;
        case 'redo':
          editor.chain().focus().redo().run();
          break;
      }

      // Update button states
      updateToolbarButtons(toolbarId, editor);
    });
  });

  // Update button states on selection change
  editor.on('selectionUpdate', () => {
    updateToolbarButtons(toolbarId, editor);
  });

  // Initial button state update
  updateToolbarButtons(toolbarId, editor);
}

export function updateToolbarButtons(toolbarId: string, editor: Editor) {
  const toolbar = document.getElementById(toolbarId);
  if (!toolbar) return;

  const buttons = toolbar.querySelectorAll('.toolbar-btn');
  
  buttons.forEach((button) => {
    const action = (button as HTMLElement).dataset.action;
    if (!action) return;

    let isActive = false;
    
    switch (action) {
      case 'bold':
        isActive = editor.isActive('bold');
        break;
      case 'italic':
        isActive = editor.isActive('italic');
        break;
      case 'heading1':
        isActive = editor.isActive('heading', { level: 1 });
        break;
      case 'heading2':
        isActive = editor.isActive('heading', { level: 2 });
        break;
      case 'heading3':
        isActive = editor.isActive('heading', { level: 3 });
        break;
      case 'bulletList':
        isActive = editor.isActive('bulletList');
        break;
      case 'orderedList':
        isActive = editor.isActive('orderedList');
        break;
      case 'blockquote':
        isActive = editor.isActive('blockquote');
        break;
      case 'code':
        isActive = editor.isActive('code');
        break;
    }

    if (isActive) {
      button.classList.add('is-active');
    } else {
      button.classList.remove('is-active');
    }
  });
}
