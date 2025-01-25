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
exports.askForMPRestClientVersion = exports.askForPackageName = exports.askForTargetFolder = exports.askForInputURL = exports.askForInputFile = exports.askForInputMethod = void 0;
/**
 * Copyright (c) 2019, 2024 IBM Corporation.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */
const vscode = require("vscode");
const workspace_1 = require("./workspace");
const constants_1 = require("../constants");
function askForFile(customOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = Object.assign({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false }, customOptions);
        const result = yield vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            return result[0];
        }
        return undefined;
    });
}
function askForFolder(customOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = Object.assign({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false }, customOptions);
        const result = yield vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            return result[0];
        }
        return undefined;
    });
}
function askForInputMethod() {
    return __awaiter(this, void 0, void 0, function* () {
        return vscode.window.showQuickPick([constants_1.INPUT_OPTIONS.FROM_FILE, constants_1.INPUT_OPTIONS.FROM_URL], {
            ignoreFocusOut: true,
            placeHolder: "Select a method of providing an OpenAPI file.",
        });
    });
}
exports.askForInputMethod = askForInputMethod;
function askForInputFile(defaultUri) {
    return __awaiter(this, void 0, void 0, function* () {
        return askForFile({
            openLabel: "Generate from this file",
            defaultUri: defaultUri,
        });
    });
}
exports.askForInputFile = askForInputFile;
function askForInputURL() {
    return __awaiter(this, void 0, void 0, function* () {
        return vscode.window.showInputBox({
            placeHolder: "e.g. http://www.example.com/openapi.yaml",
            prompt: "Generate from the file at this URL",
            ignoreFocusOut: true,
        });
    });
}
exports.askForInputURL = askForInputURL;
function askForTargetFolder(defaultUri) {
    return __awaiter(this, void 0, void 0, function* () {
        return askForFolder({
            openLabel: "Generate REST Client into this package",
            defaultUri: defaultUri,
        });
    });
}
exports.askForTargetFolder = askForTargetFolder;
function askForPackageName(targetDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const defaultPackageName = (0, workspace_1.getDefaultPackageName)(targetDir);
        const packageNameRegex = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/; // used to validate the package name
        return yield vscode.window.showInputBox({
            placeHolder: "e.g. com.example",
            prompt: "Input package name for your project",
            ignoreFocusOut: true,
            validateInput: (value) => {
                // allow no package name or a valid java package name
                if (value !== "" && packageNameRegex.test(value) === false) {
                    return "Invalid package name";
                }
                else {
                    return null;
                }
            },
            value: defaultPackageName,
        });
    });
}
exports.askForPackageName = askForPackageName;
function askForMPRestClientVersion() {
    return __awaiter(this, void 0, void 0, function* () {
        return vscode.window.showQuickPick([constants_1.MP_REST_CLIENT_VERSION.VERSION_30, constants_1.MP_REST_CLIENT_VERSION.VERSION_20, constants_1.MP_REST_CLIENT_VERSION.VERSION_141], {
            ignoreFocusOut: true,
            placeHolder: "Select the MicroProfle Rest Client version.",
        });
    });
}
exports.askForMPRestClientVersion = askForMPRestClientVersion;
//# sourceMappingURL=vscodePrompts.js.map