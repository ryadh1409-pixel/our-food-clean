import type { TimeContext } from '@/services/chatAssistantOrders';
import {
  handleUserChatTurn,
  initialChatState,
  type ChatState,
} from '@/services/ai';
import { useCallback, useRef } from 'react';

/**
 * Conversation state + pipeline for the assistant tab (intent, confirmation, de-dupe).
 */
export function useAIChat() {
  const stateRef = useRef<ChatState>({ ...initialChatState });

  const markIntroSuggestedTemplate = useCallback(() => {
    stateRef.current = {
      ...stateRef.current,
      templateSuggestedOnce: true,
    };
  }, []);

  const resetChatState = useCallback(() => {
    stateRef.current = { ...initialChatState };
  }, []);

  const runUserTurn = useCallback(
    async (params: {
      text: string;
      uid: string;
      nearbyJoinableCount: number;
      timeContext: TimeContext;
      awaitingPartnerAlone?: boolean;
    }) => {
      const result = await handleUserChatTurn({
        text: params.text,
        state: stateRef.current,
        uid: params.uid,
        nearbyJoinableCount: params.nearbyJoinableCount,
        timeContext: params.timeContext,
        awaitingPartnerAlone: params.awaitingPartnerAlone,
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
