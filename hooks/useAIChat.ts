import type { TimeContext } from '@/services/chatAssistantOrders';
import {
  handleUserChatTurn,
  initialAiSessionState,
  type AssistantUserContext,
  type AiSessionState,
} from '@/services/ai';
import { useCallback, useRef } from 'react';

/**
 * Conversation state + pipeline for the assistant tab (order builder state machine, de-dupe).
 */
export function useAIChat() {
  const stateRef = useRef<AiSessionState>(initialAiSessionState());

  const markIntroSuggestedTemplate = useCallback(() => {
    stateRef.current = {
      ...stateRef.current,
      templateSuggestedOnce: true,
    };
  }, []);

  const resetChatState = useCallback(() => {
    stateRef.current = initialAiSessionState();
  }, []);

  const runUserTurn = useCallback(
    async (params: {
      text: string;
      uid: string;
      nearbyJoinableCount: number;
      timeContext: TimeContext;
      awaitingPartnerAlone?: boolean;
      assistantContext?: AssistantUserContext | null;
      userLocation?: {
        lat: number | null;
        lng: number | null;
        label?: string | null;
      } | null;
    }) => {
      const result = await handleUserChatTurn({
        text: params.text,
        state: stateRef.current,
        uid: params.uid,
        nearbyJoinableCount: params.nearbyJoinableCount,
        timeContext: params.timeContext,
        awaitingPartnerAlone: params.awaitingPartnerAlone,
        assistantContext: params.assistantContext,
        userLocation: params.userLocation ?? null,
      });
      stateRef.current = result.state;
      return result;
    },
    [],
  );

  return {
    markIntroSuggestedTemplate,
    resetChatState,
    runUserTurn,
  };
}
