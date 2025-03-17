"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const copilotRequest_1 = __importDefault(require("./copilotRequest"));
const vscode_1 = require("vscode");
const system_ai_prompt_1 = require("./system-ai-prompt");
const user_ai_prompt_1 = require("./user-ai-prompt");
const util_1 = require("./util");
const PARTICIPANT_ID = 'springboot.agent';
const SYSTEM_PROMPT = system_ai_prompt_1.systemPrompt;
const USER_PROMPT = user_ai_prompt_1.userPrompt;
class SpringBootChatAgent {
    constructor(copilotRequest) {
        this.copilotRequest = copilotRequest;
    }
    handlePrompts(request, context, stream, cancellationToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const selectedProject = (yield (0, util_1.getWorkspaceRoot)());
            if (!selectedProject) {
                stream.markdown('No project selected from the workspace');
                return;
            }
            const selectedProjectUri = vscode_1.Uri.file(selectedProject === null || selectedProject === void 0 ? void 0 : selectedProject.fsPath).toString();
            // Fetch project related information from the Spring Boot language server
            const bootProjInfo = yield vscode_1.commands.executeCommand("sts/spring-boot/bootProjectInfo", selectedProjectUri);
            const projectContext = `
            Use the following project information for the solution: Please suggest code compatible with the project version.

            Main Spring project name: ${bootProjInfo.name}
            Root Package name: ${bootProjInfo.mainClass.substring(0, bootProjInfo.mainClass.lastIndexOf('.'))}
            Build tool: ${bootProjInfo.buildTool}
            Spring Boot version: ${bootProjInfo.springBootVersion}
            Java version: ${bootProjInfo.javaVersion}
            User prompt: ${request.prompt}
        `;
            // Enhance prompt with project information and user prompt. Provide spring boot 3 speicifc context when necessary
            const messages = [
                vscode_1.LanguageModelChatMessage.User(projectContext),
                bootProjInfo.springBootVersion.startsWith('3') ? vscode_1.LanguageModelChatMessage.User(system_ai_prompt_1.systemBoot3Prompt) : vscode_1.LanguageModelChatMessage.User(system_ai_prompt_1.systemBoot2Prompt),
                vscode_1.LanguageModelChatMessage.User('User Input: ' + request.prompt),
            ];
            stream.progress('Generating code....This will take a few minutes');
            // Chat request to copilot LLM
            const response = yield this.copilotRequest.chatRequest(messages, {}, cancellationToken);
            let documentContent;
            if (response == null || response === '') {
                documentContent = 'Failed to process the request. Please try again.';
            }
            else {
                if (bootProjInfo.springBootVersion.startsWith('3')) {
                    documentContent = (yield vscode_1.commands.executeCommand("sts/copilot/agent/enhanceResponse", response));
                }
                else {
                    documentContent = 'Note: The code provided is just an example and may not be suitable for production use. \n ' + response;
                }
            }
            // write the final response to markdown file
            yield (0, util_1.writeResponseToFile)(documentContent, bootProjInfo.name, selectedProject.fsPath);
            const chatResponse = Buffer.from(documentContent).toString();
            stream.markdown(chatResponse);
            stream.button({
                command: 'vscode-spring-boot.agent.apply',
                title: vscode_1.l10n.t('Apply Changes')
            });
            return { metadata: { command: '' } };
        });
    }
}
exports.default = SpringBootChatAgent;
function activate(context) {
    const systemPrompts = [
        new vscode_1.LanguageModelChatMessage(vscode_1.LanguageModelChatMessageRole.User, SYSTEM_PROMPT),
        // new LanguageModelChatMessage(LanguageModelChatMessageRole.User, USER_PROMPT)
    ];
    const copilotRequest = new copilotRequest_1.default(systemPrompts);
    const springBootChatAgent = new SpringBootChatAgent(copilotRequest);
    const agent = vscode_1.chat.createChatParticipant(PARTICIPANT_ID, (request, context, progress, token) => __awaiter(this, void 0, void 0, function* () {
        return springBootChatAgent.handlePrompts(request, context, progress, token);
    }));
    agent.iconPath = vscode_1.Uri.joinPath(context.extensionUri, 'readme-imgs', 'sts4-32.png');
}
exports.activate = activate;
//# sourceMappingURL=springBootAgent.js.map