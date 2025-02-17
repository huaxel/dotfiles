import CopilotRequest from "./copilotRequest";
import { CancellationToken, ChatContext, ChatRequest, ChatResponseStream, ChatResult, ExtensionContext } from "vscode";
interface SpringBootChatAgentResult extends ChatResult {
    metadata: {
        command: string;
    };
}
export default class SpringBootChatAgent {
    copilotRequest: CopilotRequest;
    constructor(copilotRequest: CopilotRequest);
    handlePrompts(request: ChatRequest, context: ChatContext, stream: ChatResponseStream, cancellationToken: CancellationToken): Promise<SpringBootChatAgentResult>;
}
export declare function activate(context: ExtensionContext): void;
export {};
