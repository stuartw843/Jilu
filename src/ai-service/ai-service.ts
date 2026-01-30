import OpenAI from "openai";
import type { TranscriptTurn } from "../types";
import { estimateTokens } from "./token-utils";
import { enhanceNotes } from "./enhance";
import { isContextWindowError } from "./errors";
import { generateTitle as generateTitleHelper } from "./title";
import { chatWithTranscript as chatWithTranscriptHelper } from "./chat";
import { prepareTranscriptForPrompt } from "./transcript-format";

type Provider = "openai" | "local";
const OPENAI_MAX_PROMPT_TOKENS = 120000;
const OPENAI_CHUNK_SUMMARY_TOKENS = 900;
const LOCAL_MAX_PROMPT_TOKENS = 20000;
const LOCAL_CHUNK_SUMMARY_TOKENS = 600;

interface LimitOptions {
  maxPromptTokens?: number;
  maxChunkTokens?: number;
  chunkSummaryMaxTokens?: number;
}

export class AIService {
  private client: OpenAI | null = null;
  private model = "gpt-4o-mini";
  private provider: Provider = "openai";
  private maxPromptTokens = OPENAI_MAX_PROMPT_TOKENS;
  private maxChunkTokens = 6000;
  private chunkSummaryMaxTokens = OPENAI_CHUNK_SUMMARY_TOKENS;

  private applyProviderDefaults(provider: Provider) {
    this.provider = provider;
    if (provider === "openai") {
      this.maxPromptTokens = OPENAI_MAX_PROMPT_TOKENS;
      this.maxChunkTokens = 6000;
      this.chunkSummaryMaxTokens = OPENAI_CHUNK_SUMMARY_TOKENS;
    } else {
      this.maxPromptTokens = LOCAL_MAX_PROMPT_TOKENS;
      this.maxChunkTokens = 4000;
      this.chunkSummaryMaxTokens = LOCAL_CHUNK_SUMMARY_TOKENS;
    }
  }

  setApiKey(apiKey: string, baseURL?: string, model?: string) {
    const config: any = {
      apiKey,
      dangerouslyAllowBrowser: true,
    };

    if (baseURL && baseURL.trim()) {
      config.baseURL = baseURL.trim();
    }

    const normalizedBase = (baseURL || "").toLowerCase();
    const isOpenAiEndpoint = normalizedBase.includes("api.openai.com");
    const isLocalAuth = !apiKey || apiKey === "local-llm";
    const provider: Provider = isLocalAuth || (!isOpenAiEndpoint && Boolean(baseURL)) ? "local" : "openai";
    this.applyProviderDefaults(provider);

    if (model && model.trim()) {
      this.model = model.trim();
    } else {
      this.model = "gpt-4o-mini";
    }

    this.client = new OpenAI(config);
  }

  configureLimits(options: LimitOptions) {
    if (typeof options.maxPromptTokens === "number" && options.maxPromptTokens > 0) {
      this.maxPromptTokens = options.maxPromptTokens;
    }
    if (typeof options.maxChunkTokens === "number" && options.maxChunkTokens > 0) {
      this.maxChunkTokens = options.maxChunkTokens;
    }
    if (typeof options.chunkSummaryMaxTokens === "number" && options.chunkSummaryMaxTokens > 0) {
      this.chunkSummaryMaxTokens = options.chunkSummaryMaxTokens;
    }
  }

  private ensureClient(): OpenAI {
    if (!this.client) {
      throw new Error("OpenAI API key not set");
    }
    return this.client;
  }

  private getEnhancementDeps() {
    const client = this.ensureClient();
    return {
      client,
      model: this.model,
      maxPromptTokens: this.maxPromptTokens,
      maxChunkTokens: this.maxChunkTokens,
      chunkSummaryMaxTokens: this.chunkSummaryMaxTokens,
      estimateTokens,
    };
  }

  private getChatDeps() {
    const client = this.ensureClient();
    return {
      client,
      model: this.model,
      maxPromptTokens: this.maxPromptTokens,
      maxChunkTokens: this.maxChunkTokens,
      chunkSummaryMaxTokens: this.chunkSummaryMaxTokens,
      estimateTokens,
      isContextWindowError,
      provider: this.provider,
    };
  }

  private getTitleDeps() {
    const client = this.ensureClient();
    return {
      client,
      model: this.model,
    };
  }

  async enhanceNotes(
    transcript: string,
    personalNotes: string = "",
    templateId?: string,
    transcriptTurns?: TranscriptTurn[]
  ): Promise<string> {
    const deps = this.getEnhancementDeps();
    try {
      const prepared = prepareTranscriptForPrompt(transcript, transcriptTurns);
      return await enhanceNotes(
        deps,
        prepared.transcriptWithLegend,
        personalNotes,
        templateId,
        prepared.transcriptTurns,
        isContextWindowError,
        prepared.speakerLegend
      );
    } catch (error) {
      throw error instanceof Error ? error : new Error(`Failed to enhance notes: ${String(error)}`);
    }
  }

  async generateTitle(transcript: string, personalNotes: string, transcriptTurns?: TranscriptTurn[]): Promise<string> {
    const deps = this.getTitleDeps();
    const prepared = prepareTranscriptForPrompt(transcript, transcriptTurns);
    return generateTitleHelper(deps, prepared.transcriptWithLegend, personalNotes);
  }

  async chatWithTranscript(
    transcript: string,
    personalNotes: string,
    enhancedNotes: string,
    question: string,
    transcriptTurns?: TranscriptTurn[]
  ): Promise<string> {
    const deps = this.getChatDeps();
    const prepared = prepareTranscriptForPrompt(transcript, transcriptTurns);
    return chatWithTranscriptHelper(
      deps,
      prepared.transcriptWithLegend,
      personalNotes,
      enhancedNotes,
      question,
      prepared.transcriptTurns,
      prepared.speakerLegend
    );
  }
}

export const aiService = new AIService();
