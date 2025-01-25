import { Disposable } from "vscode";
export declare const TEST_RUNNER_MAIN_CLASSES: string[];
export declare function hookListenerToBooleanPreference(setting: string, listenerCreator: () => Disposable): Disposable;
export declare function startDebugSupport(): Disposable;
