// Chat interface management
import { elements } from "../dom";
import { getCurrentMeeting } from "../state";
import { aiService } from "../ai-service";
import { openSettings } from "./settings";
import { renderMarkdown, transcriptTurnsToText } from "../utils";
import { showToast } from "./interactions";
import { getOpenAIApiKey } from "../secure-storage";
import { STORAGE_KEY_OPENAI_ENDPOINT } from "../constants";

interface ChatRenderOptions {
  allowHtml?: boolean;
  showSpinner?: boolean;
}

export function addChatMessage(
  content: string,
  role: "user" | "assistant",
  id?: string,
  options?: ChatRenderOptions
) {
  if (!elements.chatMessages) return;

  // Remove welcome message if it exists
  const welcome = elements.chatMessages.querySelector(".chat-welcome");
  if (welcome) welcome.remove();

  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;
  if (id) messageDiv.id = id;

  const labelDiv = document.createElement("div");
  labelDiv.className = "chat-message-label";
  labelDiv.textContent = role === "user" ? "You" : "AI Assistant";

  const contentDiv = document.createElement("div");
  contentDiv.className = "chat-message-content";

  if (options?.showSpinner) {
    const spinner = document.createElement("span");
    spinner.className = "loading";
    contentDiv.appendChild(spinner);
    contentDiv.append(" ", content);
  } else if (options?.allowHtml) {
    contentDiv.classList.add("markdown-content");
    renderMarkdown(content, contentDiv);
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(labelDiv);
  messageDiv.appendChild(contentDiv);

  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

export async function sendChatMessage() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting || !elements.chatInput || !elements.chatMessages) return;

  const question = elements.chatInput.value.trim();
  if (!question) return;

  const storedKey = await getOpenAIApiKey();
  const hasProvider = Boolean(storedKey || localStorage.getItem(STORAGE_KEY_OPENAI_ENDPOINT));
  if (!hasProvider) {
    showToast("Add your OpenAI API key or a local LLM endpoint in Settings to use chat.", { type: "warning" });
    openSettings();
    return;
  }

  // Add user message
  addChatMessage(question, "user");
  elements.chatInput.value = "";

  // Add loading message
  const loadingId = "loading-" + Date.now();
  addChatMessage("Thinking...", "assistant", loadingId, { showSpinner: true });

  try {
    const answer = await aiService.chatWithTranscript(
      transcriptTurnsToText(currentMeeting.transcript),
      currentMeeting.personalNotes,
      currentMeeting.enhancedNotes,
      question,
      currentMeeting.transcript
    );

    // Remove loading message and add actual answer
    document.getElementById(loadingId)?.remove();
    addChatMessage(answer, "assistant", undefined, { allowHtml: true });
  } catch (error) {
    console.error("Error in chat:", error);
    document.getElementById(loadingId)?.remove();
    addChatMessage(`Error: ${error}`, "assistant");
  }
}

export function clearChatMessages() {
  if (!elements.chatMessages) return;
  
  elements.chatMessages.innerHTML = `
    <div class="chat-welcome">
      <p>💬 Ask questions about your meeting</p>
      <p class="small-text">Examples: "What were the key decisions?", "List the action items", "Who said what about the budget?"</p>
    </div>
  `;
}

export function setupChatListeners() {
  elements.chatSendBtn?.addEventListener("click", sendChatMessage);
  elements.chatInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });
}
