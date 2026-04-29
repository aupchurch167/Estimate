export type AIMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface AIConversation {
  id: string;
  estimateId: string;
  modelVersion: string;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  authorUserId: string | null;
  content: string;
  runId: string | null;
  order: number;
  createdAt: string;
}

export type AIRunType =
  | 'GENERATE_LINE_ITEMS'
  | 'DRAFT_EXEC_SUMMARY'
  | 'SUGGEST_PRICE'
  | 'CLASSIFY_SCOPE'
  | 'ASK_FOLLOWUP'
  | 'OTHER';

export type AIRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface GenerateLineItemsOutput {
  scopeSummary: string;
  assumptions: string[];
  sections: {
    name: string;
    description?: string | null;
    categoryName?: string | null;
    lineItems: {
      description: string;
      quantity: number;
      unitOfMeasure: string;
      priceBookEntryCode: string | null;
      priceBookEntryDescription: string | null;
      aiConfidence: number;
      aiAssumption: string | null;
    }[];
  }[];
}

export type ProposedAction =
  | {
      type: 'ADD_LINE_ITEM';
      scopeSectionId: string;
      description: string;
      quantity: string;
      unitOfMeasure: string;
      aiAssumption?: string | null;
    }
  | {
      type: 'UPDATE_LINE_ITEM';
      lineItemId: string;
      description?: string;
      quantity?: string;
      unitOfMeasure?: string;
      aiAssumption?: string | null;
    }
  | {
      type: 'REMOVE_LINE_ITEM';
      lineItemId: string;
    }
  | {
      type: 'ADD_SECTION';
      name: string;
      description?: string | null;
    };

export interface AskFollowupOutput {
  assistantMessage: string;
  suggestedAction: 'none' | 'regenerate_line_items';
  proposedActions: ProposedAction[];
}

export type AIRunOutput = GenerateLineItemsOutput | AskFollowupOutput | Record<string, unknown>;

export interface AIRun {
  id: string;
  conversationId: string;
  estimateId: string;
  triggeredById: string;
  runType: AIRunType;
  status: AIRunStatus;
  inputs: unknown;
  outputs: AIRunOutput | null;
  errorMessage: string | null;
  modelVersion: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ConversationResponse {
  conversation: AIConversation | null;
  messages: AIMessage[];
  runs: AIRun[];
}
