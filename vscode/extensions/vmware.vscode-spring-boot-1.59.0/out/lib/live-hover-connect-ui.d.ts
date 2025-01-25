import { LanguageClient } from "vscode-languageclient/node";
import { ActivatorOptions } from '@pivotal-tools/commons-vscode';
import { ExtensionContext, QuickPickItem } from 'vscode';
export declare const CONNECT_CMD = "sts/livedata/connect";
export declare const DISCONNECT_CMD = "sts/livedata/disconnect";
export declare const REFRESH_CMD = "sts/livedata/refresh";
export declare const LIST_CMD = "sts/livedata/listProcesses";
interface ProcessCommandInfo {
    processKey: string;
    label: string;
    action: string;
    projectName: string;
}
export interface RemoteBootApp {
    jmxurl: string;
    host: string;
    urlScheme: "https" | "http";
    port: string;
    manualConnect: boolean;
    keepChecking?: boolean;
    processId: string;
    processName: string;
    projectName?: string;
}
export interface BootAppQuickPick extends QuickPickItem {
    commandInfo: ProcessCommandInfo;
}
/** Called when extension is activated */
export declare function activate(client: LanguageClient, options: ActivatorOptions, context: ExtensionContext): void;
export {};
