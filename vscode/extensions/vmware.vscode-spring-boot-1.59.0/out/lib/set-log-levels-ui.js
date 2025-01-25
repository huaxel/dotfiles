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
exports.activate = void 0;
const notification_1 = require("./notification");
const live_hover_connect_ui_1 = require("./live-hover-connect-ui");
const vscode_1 = require("vscode");
function setLogLevelHandler() {
    return __awaiter(this, void 0, void 0, function* () {
        const processInfo = yield selectRunningProcess();
        if (processInfo) {
            try {
                const loggers = yield getLoggers(processInfo);
                yield displayLoggers(loggers, processInfo.processKey);
            }
            catch (error) {
                vscode_1.window.showErrorMessage("Failed to fetch loggers for the process " + processInfo.processKey);
            }
        }
    });
}
function selectRunningProcess() {
    return __awaiter(this, void 0, void 0, function* () {
        const quickPick = vscode_1.window.createQuickPick();
        quickPick.title = 'Searching for running Spring Boot Apps...';
        quickPick.canSelectMany = false;
        quickPick.busy = true;
        quickPick.show();
        const items = (yield vscode_1.commands.executeCommand(live_hover_connect_ui_1.LIST_CMD)).filter(cp => live_hover_connect_ui_1.CONNECT_CMD === cp.action || live_hover_connect_ui_1.DISCONNECT_CMD === cp.action).map(cp => ({
            label: cp.label,
            commandInfo: cp
        }));
        quickPick.busy = false;
        quickPick.title = items.length ? "Select running Spring Boot App" : "No running Spring Boot Apps found";
        quickPick.items = items;
        if (!items.length) {
            quickPick.hide();
            vscode_1.window.showInformationMessage("No running Spring Boot Apps found");
            return;
        }
        return new Promise((resolve, reject) => {
            quickPick.onDidChangeSelection(() => quickPick.hide());
            quickPick.onDidHide(() => __awaiter(this, void 0, void 0, function* () { var _a; return resolve(Array.isArray(quickPick.selectedItems) ? (_a = quickPick.selectedItems[0]) === null || _a === void 0 ? void 0 : _a.commandInfo : undefined); }));
        });
    });
}
function getLoggers(processInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            yield vscode_1.window.withProgress({
                location: vscode_1.ProgressLocation.Window,
                title: "Fetching Loggers Data for process " + processInfo.processKey,
                cancellable: false
            }, (progress) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const loggers = yield vscode_1.commands.executeCommand('sts/livedata/getLoggers', processInfo, { "endpoint": "loggers" });
                    progress.report({});
                    resolve(loggers);
                }
                catch (error) {
                    reject(error);
                }
            }));
        }));
    });
}
function displayLoggers(processLoggersData, processKey) {
    return __awaiter(this, void 0, void 0, function* () {
        let items;
        const loggersData = processLoggersData.loggers;
        if (loggersData.loggers) {
            items = Object.keys(loggersData.loggers).map(packageName => {
                const logger = loggersData.loggers[packageName];
                const effectiveLevel = logger.effectiveLevel;
                const label = packageName + ' (' + effectiveLevel + ')';
                return {
                    packageName,
                    effectiveLevel,
                    label
                };
            });
        }
        if (items) {
            const chosenPackage = yield vscode_1.window.showQuickPick(items, {
                canPickMany: false,
                title: "Select Logger"
            });
            if (chosenPackage) {
                const chosenlogLevel = yield vscode_1.window.showQuickPick(loggersData.levels, {
                    canPickMany: false,
                    title: "Select Level"
                });
                yield vscode_1.commands.executeCommand('sts/livedata/configure/logLevel', { "processKey": processKey }, chosenPackage, { "configuredLevel": chosenlogLevel });
            }
        }
    });
}
function logLevelUpdated(process) {
    return __awaiter(this, void 0, void 0, function* () {
        vscode_1.window.showInformationMessage("The Log level for " + process.packageName + " has been updated from " +
            process.effectiveLevel + " to " + process.configuredLevel);
    });
}
/** Called when extension is activated */
function activate(client, options, context) {
    client.onNotification(notification_1.LiveProcessLogLevelUpdatedNotification.type, logLevelUpdated);
    context.subscriptions.push(vscode_1.commands.registerCommand('vscode-spring-boot.set.log-levels', () => {
        if (client.isRunning()) {
            return setLogLevelHandler();
        }
        else {
            vscode_1.window.showErrorMessage("No Spring Boot project found. Action is only available for Spring Boot Projects");
        }
    }));
}
exports.activate = activate;
//# sourceMappingURL=set-log-levels-ui.js.map