import { LanguageClient } from "vscode-languageclient/node";
import { ActivatorOptions } from '@pivotal-tools/commons-vscode';
import { ExtensionContext } from "vscode";
export interface Logger {
    configuredLevel: string;
    effectiveLevel: string;
}
export interface Loggers {
    [propName: string]: Logger;
}
export interface LoggersData {
    levels: string[];
    loggers: Loggers;
}
export interface ProcessLoggersData {
    loggers: LoggersData;
    processID: string;
    processName: string;
    processType: number;
}
export interface LoggerItem {
    logger: Logger;
    name: string;
}
/** Called when extension is activated */
export declare function activate(client: LanguageClient, options: ActivatorOptions, context: ExtensionContext): void;
