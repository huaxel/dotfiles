"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
/**
 * Copyright (c) 2019 IBM Corporation.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */
const vscode = require("vscode");
const generateProject_1 = require("./commands/generateProject");
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("microprofile.restclient.generate", (fileUri) => {
        (0, generateProject_1.generateProject)(fileUri);
    }));
}
exports.activate = activate;
// eslint-disable-next-line @typescript-eslint/no-empty-function
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map