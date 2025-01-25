"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exec = void 0;
/**
 * Copyright (c) 2019 IBM Corporation.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */
const childProcess = require("child_process");
const util_1 = require("util");
exports.exec = (0, util_1.promisify)(childProcess.exec);
//# sourceMappingURL=process.js.map