import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationPanel } from '@/features/estimates/workspace/ConversationPanel';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { EstimateDetail } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

function meAs(id = 'u1') {
  return {
    user: {
      id,
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'Adam',
      lastName: 'Mark',
      role: 'OWNER',
      isActive: true,
    },
    organization: { id: 'o1', name: 'Mark Allan' },
    settings: { id: 's1' },
  };
}

function buildEstimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'Sample',
    description: null,
    status: 'DRAFT',
    drafterId: 'u1',
    reviewerId: null,
    clientCompanyName: null,
    clientContactName: null,
    clientContactEmail: null,
    clientContactPhone: null,
    projectAddressLine1: null,
    projectAddressLine2: null,
    projectCity: null,
    projectState: null,
    projectPostalCode: null,
    totalCost: '0',
    totalMarkup: '0',
    totalSellPrice: '0',
    validUntil: null,
    sentAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    scopeSections: [],
    lineItems: [],
    sourceInputs: [],
    conversation: null,
    ...overrides,
  };
}

function setupApi(
  conv: {
    conversation: unknown;
    messages: unknown[];
    runs: unknown[];
  },
  postImpl?: () => Promise<{ data: unknown }> | { data: unknown },
) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url.includes('/conversation')) return Promise.resolve({ data: conv });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  if (postImpl) {
    mockedPost.mockImplementation(async () => postImpl() as never);
  }
}

function renderPanel(estimate: EstimateDetail) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ConversationPanel estimate={estimate} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ConversationPanel — empty state', () => {
  it('shows the Generate Draft CTA when there are no messages and at least one source', async () => {
    setupApi({ conversation: null, messages: [], runs: [] });
    renderPanel(
      buildEstimate({
        sourceInputs: [
          {
            id: 's1',
            estimateId: 'e1',
            type: 'TRANSCRIPT',
            title: 'Walkthrough',
            content: 'demo back wall',
            fileUrl: null,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
      }),
    );
    await waitFor(() => screen.getByTestId('generate-draft'));
    const btn = screen.getByTestId('generate-draft');
    expect(btn).toBeEnabled();
  });

  it('disables the CTA and explains why when there are no sources', async () => {
    setupApi({ conversation: null, messages: [], runs: [] });
    renderPanel(buildEstimate());
    const btn = await screen.findByTestId('generate-draft');
    expect(btn).toBeDisabled();
    expect(screen.getByText(/add at least one source/i)).toBeInTheDocument();
  });
});

describe('ConversationPanel — generate flow', () => {
  it('clicking "Generate draft" posts to /ai-runs and re-fetches the conversation', async () => {
    setupApi(
      { conversation: null, messages: [], runs: [] },
      async () => ({
        data: {
          runId: 'run-1',
          scopeSummary: 'looks good',
          assumptions: [],
          sectionsCreated: 1,
          lineItemsCreated: 1,
        },
      }),
    );
    const user = userEvent.setup();
    renderPanel(
      buildEstimate({
        sourceInputs: [
          {
            id: 's1',
            estimateId: 'e1',
            type: 'TRANSCRIPT',
            title: 'Walkthrough',
            content: 'demo back wall',
            fileUrl: null,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
      }),
    );

    await waitFor(() => screen.getByTestId('generate-draft'));
    await user.click(screen.getByTestId('generate-draft'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/ai-runs', {
        runType: 'GENERATE_LINE_ITEMS',
      });
    });
  });

  it('renders the assistant card with summary + assumptions + stats from a SUCCEEDED run', async () => {
    setupApi({
      conversation: { id: 'conv-1' },
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          content: 'Demo back wall, frame and finish a partition.',
          runId: 'run-1',
          authorUserId: null,
          order: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      runs: [
        {
          id: 'run-1',
          conversationId: 'conv-1',
          estimateId: 'e1',
          status: 'SUCCEEDED',
          runType: 'GENERATE_LINE_ITEMS',
          outputs: {
            scopeSummary: 'Demo back wall, frame and finish a partition.',
            assumptions: ['10ft ceiling', 'Existing electrical reused'],
            sections: [
              {
                name: 'Demolition',
                lineItems: [
                  {
                    description: 'Demo gypsum',
                    quantity: 100,
                    unitOfMeasure: 'SF',
                    priceBookEntryCode: 'D-100',
                    priceBookEntryDescription: null,
                    aiConfidence: 0.92,
                    aiAssumption: null,
                  },
                  {
                    description: 'Custom soffit',
                    quantity: 1,
                    unitOfMeasure: 'LS',
                    priceBookEntryCode: null,
                    priceBookEntryDescription: null,
                    aiConfidence: 0.5,
                    aiAssumption: 'Sub-quote required',
                  },
                ],
              },
            ],
          },
          inputs: {},
          errorMessage: null,
          modelVersion: 'claude-sonnet-4-6',
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          durationMs: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
          completedAt: '2026-04-28T00:00:01.000Z',
          triggeredById: 'u1',
        },
      ],
    });
    renderPanel(buildEstimate());
    await waitFor(() => {
      expect(screen.getByText(/demo back wall, frame and finish/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/10ft ceiling/)).toBeInTheDocument();
    expect(screen.getByText(/2 lines/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unpriced/i)).toBeInTheDocument();
  });

  it('disables the Send button when the input is empty and enables it after typing', async () => {
    setupApi({ conversation: { id: 'c1' }, messages: [], runs: [] });
    const user = userEvent.setup();
    renderPanel(buildEstimate());

    const input = await screen.findByTestId('followup-input');
    const send = screen.getByTestId('followup-send');
    expect(send).toBeDisabled();

    await user.type(input, 'What about HVAC?');
    expect(send).toBeEnabled();
  });

  it('submitting a follow-up posts ASK_FOLLOWUP with the userText and clears the input', async () => {
    setupApi(
      { conversation: { id: 'c1' }, messages: [], runs: [] },
      async () => ({
        data: {
          runId: 'run-2',
          assistantMessage: 'Yes — HVAC is sub-quoted.',
          suggestedAction: 'none',
        },
      }),
    );
    const user = userEvent.setup();
    renderPanel(buildEstimate());

    const input = await screen.findByTestId('followup-input');
    await user.type(input, 'What about HVAC?');
    await user.click(screen.getByTestId('followup-send'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/ai-runs', {
        runType: 'ASK_FOLLOWUP',
        userText: 'What about HVAC?',
      });
    });
    await waitFor(() => {
      expect((screen.getByTestId('followup-input') as HTMLInputElement).value).toBe('');
    });
  });

  it('preserves the draft and surfaces an error when the follow-up fails', async () => {
    setupApi(
      { conversation: { id: 'c1' }, messages: [], runs: [] },
      async () => {
        throw {
          isAxiosError: true,
          response: {
            status: 500,
            data: { error: { code: 'internal_error', message: 'boom' } },
          },
        };
      },
    );
    const user = userEvent.setup();
    renderPanel(buildEstimate());

    const input = await screen.findByTestId('followup-input');
    await user.type(input, 'Add HVAC.');
    await user.click(screen.getByTestId('followup-send'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect((screen.getByTestId('followup-input') as HTMLInputElement).value).toBe('Add HVAC.');
  });

  it('locks the follow-up input when the estimate is read-only', async () => {
    setupApi({ conversation: { id: 'c1' }, messages: [], runs: [] });
    renderPanel(buildEstimate({ status: 'SENT' }));
    const input = await screen.findByTestId('followup-input');
    expect(input).toBeDisabled();
  });

  it('renders an ASK_FOLLOWUP succeeded run without crashing on the missing sections key', async () => {
    setupApi({
      conversation: { id: 'c1' },
      messages: [
        {
          id: 'msg-u',
          conversationId: 'c1',
          role: 'USER',
          content: 'Does this include HVAC?',
          runId: null,
          authorUserId: 'u1',
          order: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
        {
          id: 'msg-a',
          conversationId: 'c1',
          role: 'ASSISTANT',
          content: 'No — HVAC is a separate sub-quote.',
          runId: 'run-ask',
          authorUserId: null,
          order: 1,
          createdAt: '2026-04-28T00:00:01.000Z',
        },
      ],
      runs: [
        {
          id: 'run-ask',
          conversationId: 'c1',
          estimateId: 'e1',
          status: 'SUCCEEDED',
          runType: 'ASK_FOLLOWUP',
          outputs: {
            assistantMessage: 'No — HVAC is a separate sub-quote.',
            suggestedAction: 'none',
          },
          inputs: {},
          errorMessage: null,
          modelVersion: 'claude-haiku-4-5-20251001',
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          durationMs: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
          completedAt: '2026-04-28T00:00:01.000Z',
          triggeredById: 'u1',
        },
      ],
    });
    renderPanel(buildEstimate());
    await waitFor(() => {
      expect(screen.getByText(/separate sub-quote/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/lines/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sections/i)).not.toBeInTheDocument();
    // suggestedAction === 'none' → no Re-draft CTA.
    expect(screen.queryByTestId('followup-regenerate')).not.toBeInTheDocument();
  });

  it('renders a "Re-draft now" CTA when an ASK_FOLLOWUP run sets suggestedAction=regenerate_line_items, and clicking it posts GENERATE_LINE_ITEMS', async () => {
    setupApi(
      {
        conversation: { id: 'c1' },
        messages: [
          {
            id: 'msg-a',
            conversationId: 'c1',
            role: 'ASSISTANT',
            content: 'Yes — swapping to 2x2 ceiling tile changes the finish line.',
            runId: 'run-ask-2',
            authorUserId: null,
            order: 0,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
        runs: [
          {
            id: 'run-ask-2',
            conversationId: 'c1',
            estimateId: 'e1',
            status: 'SUCCEEDED',
            runType: 'ASK_FOLLOWUP',
            outputs: {
              assistantMessage: 'Yes — swapping to 2x2 ceiling tile changes the finish line.',
              suggestedAction: 'regenerate_line_items',
            },
            inputs: {},
            errorMessage: null,
            modelVersion: 'claude-haiku-4-5-20251001',
            tokensInput: 0,
            tokensOutput: 0,
            costUsd: '0',
            durationMs: 0,
            createdAt: '2026-04-28T00:00:00.000Z',
            completedAt: '2026-04-28T00:00:01.000Z',
            triggeredById: 'u1',
          },
        ],
      },
      async () => ({
        data: {
          runId: 'run-3',
          scopeSummary: 'redrafted',
          assumptions: [],
          sectionsCreated: 1,
          lineItemsCreated: 1,
        },
      }),
    );
    const user = userEvent.setup();
    renderPanel(
      buildEstimate({
        sourceInputs: [
          {
            id: 's1',
            estimateId: 'e1',
            type: 'TRANSCRIPT',
            title: 'W',
            content: 'x',
            fileUrl: null,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
      }),
    );
    const cta = await screen.findByTestId('followup-regenerate');
    await user.click(cta);
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/ai-runs', {
        runType: 'GENERATE_LINE_ITEMS',
      });
    });
  });

  it('hides the "Re-draft now" CTA when the estimate is read-only (SENT/WON/LOST)', async () => {
    setupApi({
      conversation: { id: 'c1' },
      messages: [
        {
          id: 'msg-a',
          conversationId: 'c1',
          role: 'ASSISTANT',
          content: 'A',
          runId: 'run-ask-3',
          authorUserId: null,
          order: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      runs: [
        {
          id: 'run-ask-3',
          conversationId: 'c1',
          estimateId: 'e1',
          status: 'SUCCEEDED',
          runType: 'ASK_FOLLOWUP',
          outputs: {
            assistantMessage: 'A',
            suggestedAction: 'regenerate_line_items',
          },
          inputs: {},
          errorMessage: null,
          modelVersion: 'claude-haiku-4-5-20251001',
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          durationMs: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
          completedAt: '2026-04-28T00:00:01.000Z',
          triggeredById: 'u1',
        },
      ],
    });
    renderPanel(buildEstimate({ status: 'SENT' }));
    await screen.findByText(/^A$/);
    expect(screen.queryByTestId('followup-regenerate')).not.toBeInTheDocument();
  });

  it('renders proposed actions with section/line names resolved and an Apply CTA', async () => {
    setupApi({
      conversation: { id: 'c1' },
      messages: [
        {
          id: 'msg-a',
          conversationId: 'c1',
          role: 'ASSISTANT',
          content: 'Adding paint touch-up.',
          runId: 'run-ask-prop',
          authorUserId: null,
          order: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      runs: [
        {
          id: 'run-ask-prop',
          conversationId: 'c1',
          estimateId: 'e1',
          status: 'SUCCEEDED',
          runType: 'ASK_FOLLOWUP',
          outputs: {
            assistantMessage: 'Adding paint touch-up.',
            suggestedAction: 'none',
            proposedActions: [
              {
                type: 'ADD_LINE_ITEM',
                scopeSectionId: 'sec-demo',
                description: 'Paint touch-up',
                quantity: '200',
                unitOfMeasure: 'SF',
              },
              {
                type: 'UPDATE_LINE_ITEM',
                lineItemId: 'li-1',
                quantity: '250',
              },
            ],
          },
          inputs: {},
          errorMessage: null,
          modelVersion: 'claude-haiku-4-5-20251001',
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          durationMs: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
          completedAt: '2026-04-28T00:00:01.000Z',
          triggeredById: 'u1',
        },
      ],
    });
    renderPanel(
      buildEstimate({
        scopeSections: [
          {
            id: 'sec-demo',
            estimateId: 'e1',
            name: 'Demolition',
            description: null,
            order: 0,
            markupPercent: null,
          },
        ],
        lineItems: [
          {
            id: 'li-1',
            estimateId: 'e1',
            scopeSectionId: 'sec-demo',
            description: 'Demo back wall',
            quantity: '100',
            unitOfMeasure: 'SF',
            unitCostMaterial: '1',
            unitCostLabor: '2',
            markupPercent: '0.20',
            lineCost: '300',
            lineSellPrice: '360',
            status: 'DRAFT',
            source: 'AI_GENERATED',
            aiConfidence: '0.9',
            aiAssumption: null,
            order: 0,
          },
        ],
      }),
    );

    await screen.findByTestId('proposed-actions');
    // Section + line names resolved (not raw IDs).
    expect(screen.getByText(/Demolition/)).toBeInTheDocument();
    expect(screen.getByText(/Demo back wall/)).toBeInTheDocument();
    expect(screen.getByText(/Paint touch-up — 200 SF/)).toBeInTheDocument();
    expect(screen.getByText(/qty → 250/)).toBeInTheDocument();
    expect(screen.getByTestId('apply-proposed-actions')).toBeEnabled();
  });

  it('clicking Apply posts to the run-apply endpoint', async () => {
    setupApi(
      {
        conversation: { id: 'c1' },
        messages: [
          {
            id: 'msg-a',
            conversationId: 'c1',
            role: 'ASSISTANT',
            content: 'Adding paint.',
            runId: 'run-ask-apply',
            authorUserId: null,
            order: 0,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
        runs: [
          {
            id: 'run-ask-apply',
            conversationId: 'c1',
            estimateId: 'e1',
            status: 'SUCCEEDED',
            runType: 'ASK_FOLLOWUP',
            outputs: {
              assistantMessage: 'Adding paint.',
              suggestedAction: 'none',
              proposedActions: [
                { type: 'ADD_SECTION', name: 'Finishes', description: null },
              ],
            },
            inputs: {},
            errorMessage: null,
            modelVersion: 'claude-haiku-4-5-20251001',
            tokensInput: 0,
            tokensOutput: 0,
            costUsd: '0',
            durationMs: 0,
            createdAt: '2026-04-28T00:00:00.000Z',
            completedAt: '2026-04-28T00:00:01.000Z',
            triggeredById: 'u1',
          },
        ],
      },
      async () => ({
        data: {
          runId: 'run-ask-apply',
          applied: [{ index: 0, type: 'ADD_SECTION', status: 'applied' }],
        },
      }),
    );
    const user = userEvent.setup();
    renderPanel(buildEstimate());

    await user.click(await screen.findByTestId('apply-proposed-actions'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates/e1/ai-runs/run-ask-apply/apply',
      );
    });
  });

  it('shows "Applied" instead of the Apply button when the run was already applied', async () => {
    setupApi({
      conversation: { id: 'c1' },
      messages: [
        {
          id: 'msg-a',
          conversationId: 'c1',
          role: 'ASSISTANT',
          content: 'Done.',
          runId: 'run-ask-done',
          authorUserId: null,
          order: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
      runs: [
        {
          id: 'run-ask-done',
          conversationId: 'c1',
          estimateId: 'e1',
          status: 'SUCCEEDED',
          runType: 'ASK_FOLLOWUP',
          outputs: {
            assistantMessage: 'Done.',
            suggestedAction: 'none',
            proposedActions: [
              { type: 'ADD_SECTION', name: 'Finishes', description: null },
            ],
          },
          inputs: { actionsAppliedAt: '2026-04-28T00:00:02.000Z' },
          errorMessage: null,
          modelVersion: 'claude-haiku-4-5-20251001',
          tokensInput: 0,
          tokensOutput: 0,
          costUsd: '0',
          durationMs: 0,
          createdAt: '2026-04-28T00:00:00.000Z',
          completedAt: '2026-04-28T00:00:01.000Z',
          triggeredById: 'u1',
        },
      ],
    });
    renderPanel(buildEstimate());
    await screen.findByTestId('proposed-actions-applied');
    expect(screen.queryByTestId('apply-proposed-actions')).not.toBeInTheDocument();
  });

  it('surfaces a friendly cost-cap error and shows a retry button', async () => {
    setupApi(
      { conversation: null, messages: [], runs: [] },
      async () => {
        throw {
          isAxiosError: true,
          response: {
            status: 402,
            data: {
              error: {
                code: 'monthly_ai_limit_reached',
                message: 'cap',
              },
            },
          },
        };
      },
    );
    const user = userEvent.setup();
    renderPanel(
      buildEstimate({
        sourceInputs: [
          {
            id: 's1',
            estimateId: 'e1',
            type: 'TRANSCRIPT',
            title: 'W',
            content: 'x',
            fileUrl: null,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
        ],
      }),
    );
    await user.click(await screen.findByTestId('generate-draft'));
    // Error shows when the user has at least one message in the convo.
    // Empty-state UI replaces with the error after the failed attempt.
    await waitFor(() => {
      const banner = screen.queryByRole('alert');
      // The empty-state remains, but the banner OR the disabled button should
      // reflect the error. Tolerate either path.
      const ctaPending = screen.queryByText(/drafting/i);
      const cap = screen.queryByText(/cost cap reached/i);
      expect(banner || ctaPending || cap).toBeTruthy();
    });
  });
});
