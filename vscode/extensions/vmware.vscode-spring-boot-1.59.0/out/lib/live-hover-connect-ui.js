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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = exports.LIST_CMD = exports.REFRESH_CMD = exports.DISCONNECT_CMD = exports.CONNECT_CMD = void 0;
const vscode_1 = require("vscode");
exports.CONNECT_CMD = "sts/livedata/connect";
exports.DISCONNECT_CMD = "sts/livedata/disconnect";
exports.REFRESH_CMD = "sts/livedata/refresh";
exports.LIST_CMD = "sts/livedata/listProcesses";
let activeBootApp;
let state;
function liveHoverConnectHandler() {
    return __awaiter(this, void 0, void 0, function* () {
        const quickPick = vscode_1.window.createQuickPick();
        quickPick.title = 'Searching for running Spring Boot Apps...';
        quickPick.canSelectMany = false;
        quickPick.busy = true;
        quickPick.show();
        const processData = yield vscode_1.commands.executeCommand(exports.LIST_CMD);
        const items = processData.map(p => {
            let actionLabel = "";
            switch (p.action) {
                case exports.CONNECT_CMD:
                    actionLabel = "Show";
                    break;
                case exports.REFRESH_CMD:
                    actionLabel = "Refresh";
                    break;
                case exports.DISCONNECT_CMD:
                    actionLabel = "Hide";
                    break;
            }
            const choiceLabel = actionLabel + " Live Data from: " + p.label;
            return {
                commandInfo: p,
                label: choiceLabel
            };
        });
        quickPick.busy = false;
        quickPick.title = items.length ? "Select action for running Spring Boot App" : "No running Spring Boot Apps found";
        quickPick.items = items;
        if (!items.length) {
            quickPick.hide();
            vscode_1.window.showInformationMessage("No running Spring Boot Apps found");
            return;
        }
        return yield new Promise((resolve, reject) => {
            quickPick.onDidChangeSelection(() => quickPick.hide());
            quickPick.onDidHide(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const chosen = quickPick.selectedItems ? quickPick.selectedItems[0] : undefined;
                    if (chosen) {
                        executeLiveProcessAction(chosen.commandInfo);
                    }
                    resolve(undefined);
                }
                catch (error) {
                    reject(error);
                }
            }));
        });
    });
}
function executeLiveProcessAction(commandInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        if ((activeBootApp === null || activeBootApp === void 0 ? void 0 : activeBootApp.jmxurl) === commandInfo.processKey) {
            switch (commandInfo.action) {
                case exports.CONNECT_CMD:
                    yield vscode_1.commands.executeCommand('vscode-spring-boot.live.show.active');
                    break;
                case exports.DISCONNECT_CMD:
                    yield vscode_1.commands.executeCommand('vscode-spring-boot.live.hide.active');
                    break;
                default:
                    yield vscode_1.commands.executeCommand(commandInfo.action, commandInfo);
            }
        }
        else {
            yield vscode_1.commands.executeCommand(commandInfo.action, commandInfo);
        }
    });
}
function updateBootAppState(newState) {
    return __awaiter(this, void 0, void 0, function* () {
        if (newState !== state) {
            state = newState;
            vscode_1.commands.executeCommand('setContext', 'vscode-spring-boot.active-app-state', state);
        }
    });
}
/** Called when extension is activated */
function activate(client, options, context) {
    context.subscriptions.push(vscode_1.commands.registerCommand('vscode-spring-boot.live-hover.connect', () => {
        if (client.isRunning()) {
            return liveHoverConnectHandler();
        }
        else {
            vscode_1.window.showErrorMessage("No Spring Boot project found. Action is only available for Spring Boot Projects");
        }
    }), vscode_1.commands.registerCommand("vscode-spring-boot.live.activate", (appData) => __awaiter(this, void 0, void 0, function* () {
        activeBootApp = appData;
        yield vscode_1.commands.executeCommand('sts/livedata/localAdd', activeBootApp);
        updateBootAppState("disconnected");
    })), vscode_1.commands.registerCommand("vscode-spring-boot.live.deactivate", () => __awaiter(this, void 0, void 0, function* () {
        yield vscode_1.commands.executeCommand('sts/livedata/localRemove', activeBootApp.jmxurl);
        activeBootApp = undefined;
        updateBootAppState("none");
    })), vscode_1.commands.registerCommand("vscode-spring-boot.live.show.active", () => __awaiter(this, void 0, void 0, function* () {
        try {
            updateBootAppState("connecting");
            yield vscode_1.commands.executeCommand(exports.CONNECT_CMD, {
                processKey: activeBootApp.jmxurl
            });
            updateBootAppState("connected");
        }
        catch (error) {
            updateBootAppState("disconnected");
            throw error;
        }
    })), vscode_1.commands.registerCommand("vscode-spring-boot.live.refresh.active", () => __awaiter(this, void 0, void 0, function* () {
        yield vscode_1.commands.executeCommand(exports.REFRESH_CMD, {
            processKey: activeBootApp.jmxurl
        });
    })), vscode_1.commands.registerCommand("vscode-spring-boot.live.hide.active", () => __awaiter(this, void 0, void 0, function* () {
        try {
            updateBootAppState("disconnecting");
            yield vscode_1.commands.executeCommand(exports.DISCONNECT_CMD, {
                processKey: activeBootApp.jmxurl
            });
            updateBootAppState("disconnected");
        }
        catch (error) {
            updateBootAppState("connected");
            throw error;
        }
    })));
}
exports.activate = activate;
//# sourceMappingURL=live-hover-connect-ui.js.map