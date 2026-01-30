import { elements } from "../dom";

type TabName = "notes" | "transcript" | "enhanced" | "chat";

const FIND_KEY = "f";
const GOTO_KEY = "g";
const TAB_CHANGED_EVENT = "tab-changed";

let initialized = false;
let matches: Range[] = [];
let currentIndex = -1;
let currentQuery = "";
let activeTab: TabName | null = null;
let fallbackHighlightedElement: HTMLElement | null = null;
let currentHighlightMarker: HTMLElement | null = null;

export function setupTabFind(): void {
  if (initialized) {
    return;
  }

  if (!elements.tabFindContainer || !elements.tabFindInput) {
    return;
  }

  initialized = true;

  window.addEventListener("keydown", handleGlobalKeydown, true);
  elements.tabFindInput.addEventListener("input", () => updateMatches({ resetIndex: true }));
  elements.tabFindInput.addEventListener("keydown", handleFindInputKeydown);
  elements.tabFindPrevBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    focusPreviousMatch();
  });
  elements.tabFindNextBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    focusNextMatch();
  });
  elements.tabFindCloseBtn?.addEventListener("click", closeFindOverlay);
  [elements.tabFindPrevBtn, elements.tabFindNextBtn].forEach((btn) => {
    btn?.addEventListener("mousedown", (event) => event.preventDefault());
  });

  document.addEventListener(TAB_CHANGED_EVENT, handleTabChanged as EventListener);
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) {
    return;
  }

  const key = event.key.toLowerCase();
  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  if (ctrlOrMeta && key === FIND_KEY) {
    event.preventDefault();
    event.stopPropagation();
    openFindOverlay();
    return;
  }

  if (!isFindVisible()) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeFindOverlay();
    return;
  }

  if (ctrlOrMeta && key === GOTO_KEY) {
    event.preventDefault();
    if (event.shiftKey) {
      focusPreviousMatch();
    } else {
      focusNextMatch();
    }
    return;
  }

  if (event.key === "F3") {
    event.preventDefault();
    if (event.shiftKey) {
      focusPreviousMatch();
    } else {
      focusNextMatch();
    }
  }
}

function handleFindInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.shiftKey) {
      focusPreviousMatch();
    } else {
      focusNextMatch();
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeFindOverlay();
  }
}

function handleTabChanged(event: Event): void {
  if (!isFindVisible()) {
    return;
  }

  const detail = (event as CustomEvent<{ tabName?: string }>).detail;
  if (detail?.tabName && isTabName(detail.tabName)) {
    activeTab = detail.tabName;
  } else {
    activeTab = getActiveTabName();
  }

  window.setTimeout(() => updateMatches({ resetIndex: true }), 0);
}

function openFindOverlay(): void {
  if (!elements.tabFindContainer || !elements.tabFindInput) {
    return;
  }

  elements.tabFindContainer.classList.remove("hidden");

  const selectionText = getSelectionTextFromActiveTab();
  if (selectionText) {
    elements.tabFindInput.value = selectionText;
  }

  requestAnimationFrame(() => {
    elements.tabFindInput?.focus({ preventScroll: true });
    elements.tabFindInput?.select();
    updateMatches({ resetIndex: true });
  });
}

function closeFindOverlay(): void {
  matches = [];
  currentIndex = -1;
  currentQuery = "";
  activeTab = null;
  clearCurrentHighlight();
  updateCountDisplay();

  if (elements.tabFindContainer) {
    elements.tabFindContainer.classList.add("hidden");
  }
}

function updateMatches(options: { resetIndex?: boolean } = {}): void {
  if (!isFindVisible()) {
    return;
  }

  const inputValue = elements.tabFindInput?.value ?? "";
  const query = inputValue.trim();
  currentQuery = query;

  if (!query) {
    matches = [];
    currentIndex = -1;
    clearCurrentHighlight();
    updateCountDisplay();
    return;
  }

  const tabName = getActiveTabName();
  activeTab = tabName;

  if (!tabName) {
    matches = [];
    currentIndex = -1;
    clearCurrentHighlight();
    updateCountDisplay();
    return;
  }

  const container = getContainerForTab(tabName);
  if (!container) {
    matches = [];
    currentIndex = -1;
    clearCurrentHighlight();
    updateCountDisplay();
    return;
  }

  matches = buildMatches(container, query);
  clearCurrentHighlight();

  if (!matches.length) {
    currentIndex = -1;
    clearCurrentHighlight();
    updateCountDisplay();
    return;
  }

  if (options.resetIndex || currentIndex === -1 || currentIndex >= matches.length) {
    currentIndex = 0;
  }

  highlightCurrentMatch();
}

function focusNextMatch(): void {
  if (!ensureMatchesReady()) {
    return;
  }
  if (!matches.length) {
    return;
  }

  currentIndex = (currentIndex + 1) % matches.length;
  highlightCurrentMatch();
}

function focusPreviousMatch(): void {
  if (!ensureMatchesReady()) {
    return;
  }
  if (!matches.length) {
    return;
  }

  currentIndex = (currentIndex - 1 + matches.length) % matches.length;
  highlightCurrentMatch();
}

function ensureMatchesReady(): boolean {
  if (!isFindVisible()) {
    return false;
  }

  const inputValue = elements.tabFindInput?.value ?? "";
  if (!inputValue.trim()) {
    return false;
  }

  const tabName = getActiveTabName();
  if (!tabName) {
    return false;
  }

  if (activeTab !== tabName) {
    updateMatches({ resetIndex: true });
    return matches.length > 0;
  }

  // Rebuild matches to ensure ranges stay in sync with live content.
  updateMatches({ resetIndex: false });
  return matches.length > 0;
}

function highlightCurrentMatch(): void {
  updateCountDisplay();

  if (currentIndex < 0 || currentIndex >= matches.length) {
    return;
  }

  const matchRange = matches[currentIndex];
  if (!isRangeConnected(matchRange)) {
    updateMatches({ resetIndex: false });
    return;
  }

  const targetRange = matchRange.cloneRange();
  const highlightedNode = applyHighlight(targetRange);
  if (highlightedNode instanceof HTMLElement) {
    highlightedNode.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    scrollRangeIntoView(targetRange);
  }
}

function buildMatches(container: HTMLElement, query: string): Range[] {
  const normalizedQuery = query.toLowerCase();
  const ranges: Range[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || !node.textContent.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!isElementVisible(parent, container)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const textContent = textNode.textContent;
    if (!textContent) {
      continue;
    }

    const haystack = textContent.toLowerCase();
    let fromIndex = 0;

    while (fromIndex <= haystack.length) {
      const foundIndex = haystack.indexOf(normalizedQuery, fromIndex);
      if (foundIndex === -1) {
        break;
      }

      const range = document.createRange();
      range.setStart(textNode, foundIndex);
      range.setEnd(textNode, foundIndex + query.length);
      ranges.push(range.cloneRange());

      fromIndex = foundIndex + query.length;
    }
  }

  return ranges;
}

function getActiveTabName(): TabName | null {
  const activeButton = elements.tabBtns.find((btn) => btn.classList.contains("active"));
  const tabFromButton = activeButton?.dataset.tab;
  if (isTabName(tabFromButton)) {
    return tabFromButton;
  }

  const activePane = document.querySelector<HTMLElement>(".tab-pane.active");
  if (!activePane) {
    return null;
  }

  switch (activePane.id) {
    case "notes-tab":
      return "notes";
    case "transcript-tab":
      return "transcript";
    case "enhanced-tab":
      return "enhanced";
    case "chat-tab":
      return "chat";
    default:
      return null;
  }
}

function getContainerForTab(tabName: TabName): HTMLElement | null {
  switch (tabName) {
    case "notes": {
      const editorContent = elements.notesTab?.querySelector<HTMLElement>(".tiptap-editor-content");
      return editorContent ?? elements.notesTab;
    }
    case "transcript":
      return elements.transcriptTab;
    case "enhanced": {
      const editorContainer = document.getElementById("enhanced-editor-container");
      if (editorContainer && editorContainer.style.display !== "none") {
        const editorContent = editorContainer.querySelector<HTMLElement>(".tiptap-editor-content");
        if (editorContent) {
          return editorContent;
        }
      }

      if (elements.enhancedContent && isElementVisible(elements.enhancedContent, elements.enhancedTab)) {
        return elements.enhancedContent;
      }

      return elements.enhancedTab;
    }
    case "chat":
      return elements.chatMessages ?? elements.chatTab;
    default:
      return null;
  }
}

function updateCountDisplay(): void {
  if (!elements.tabFindCount) {
    return;
  }

  if (!currentQuery || !matches.length) {
    elements.tabFindCount.textContent = "0/0";
    elements.tabFindCount.classList.add("no-match");
    return;
  }

  elements.tabFindCount.textContent = `${currentIndex + 1}/${matches.length}`;
  elements.tabFindCount.classList.remove("no-match");
}

function scrollRangeIntoView(range: Range): void {
  const node = range.startContainer;
  let element: HTMLElement | null = null;

  if (node instanceof HTMLElement) {
    element = node;
  } else if (node instanceof Text) {
    element = node.parentElement;
  }

  if (!element) {
    const ancestor = range.commonAncestorContainer;
    element = ancestor instanceof HTMLElement ? ancestor : ancestor.parentElement;
  }

  element?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyHighlight(range: Range): HTMLElement | null {
  clearCurrentHighlight();

  const highlightHost = getHighlightHost(range);
  if (highlightHost) {
    highlightHost.classList.add("tab-find-match");
    fallbackHighlightedElement = highlightHost;
  }

  const marker = document.createElement("mark");
  marker.className = "tab-find-highlight";

  try {
    range.surroundContents(marker);
  } catch (error) {
    const extracted = range.extractContents();
    marker.appendChild(extracted);
    range.insertNode(marker);
  }

  currentHighlightMarker = marker;
  return marker;
}

function clearCurrentHighlight(): void {
  if (currentHighlightMarker) {
    const marker = currentHighlightMarker;
    const parent = marker.parentNode;
    if (parent) {
      while (marker.firstChild) {
        parent.insertBefore(marker.firstChild, marker);
      }
      parent.removeChild(marker);
      if (parent instanceof HTMLElement) {
        parent.normalize();
      } else if (parent instanceof Text) {
        parent.parentElement?.normalize();
      }
    }
    currentHighlightMarker = null;
  }

  if (fallbackHighlightedElement) {
    fallbackHighlightedElement.classList.remove("tab-find-match");
    fallbackHighlightedElement = null;
  }
}

function getHighlightHost(range: Range): HTMLElement | null {
  const node = range.startContainer;
  const candidate =
    node instanceof HTMLElement ? node : node instanceof Text ? node.parentElement : null;

  if (!candidate) {
    return null;
  }

  if (candidate.closest("#tab-find")) {
    return null;
  }

  if (activeTab) {
    const container = getContainerForTab(activeTab);
    if (container && !container.contains(candidate)) {
      return null;
    }
  }

  return candidate;
}

function isElementVisible(element: HTMLElement, root: HTMLElement | null): boolean {
  if (!root) {
    return isElementActuallyVisible(element);
  }

  let current: HTMLElement | null = element;
  while (current && current !== root) {
    if (!isElementActuallyVisible(current)) {
      return false;
    }
    current = current.parentElement;
  }

  return isElementActuallyVisible(element);
}

function isElementActuallyVisible(element: HTMLElement): boolean {
  if (element.hasAttribute("hidden")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isRangeConnected(range: Range): boolean {
  const start = range.startContainer;
  const end = range.endContainer;
  return isNodeConnected(start) && isNodeConnected(end);
}

function isNodeConnected(node: Node | null): boolean {
  if (!node) {
    return false;
  }
  return node.isConnected ?? document.contains(node);
}

function isTabName(value: string | null | undefined): value is TabName {
  return value === "notes" || value === "transcript" || value === "enhanced" || value === "chat";
}

function getSelectionTextFromActiveTab(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  const activeRange = selection.getRangeAt(0);
  const activeTabName = getActiveTabName();
  if (!activeTabName) {
    return null;
  }

  const container = getContainerForTab(activeTabName);
  if (!container) {
    return null;
  }

  const anchorNode = activeRange.commonAncestorContainer;
  if (!container.contains(anchorNode)) {
    return null;
  }

  // Avoid prefilling extremely long selections.
  if (selectedText.length > 200) {
    return null;
  }

  return selectedText;
}

function isFindVisible(): boolean {
  return !!elements.tabFindContainer && !elements.tabFindContainer.classList.contains("hidden");
}
