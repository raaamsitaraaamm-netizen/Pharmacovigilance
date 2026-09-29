import { MockLlmClient } from "@/lib/llm/llmClient";
import type { LlmClient, LlmCompletionRequest } from "@/lib/llm/llmClient";

/** Deterministic stand-in for the future Amazon Bedrock Runtime adapter. */
export class BedrockMockLlmClient implements LlmClient {
  readonly modelName = "amazon.nova-lite-v1:0 (mock)";
  private readonly mock = new MockLlmClient();

  complete(request: LlmCompletionRequest): Promise<string> {
    return this.mock.complete(request);
  }
}