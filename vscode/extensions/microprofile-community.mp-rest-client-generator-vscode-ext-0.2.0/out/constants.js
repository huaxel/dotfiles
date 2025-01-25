"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPEC_VALIDATION_EXCEPTION = exports.GENERATOR_JAR_PATH = exports.MP_REST_CLIENT_VERSION = exports.INPUT_OPTIONS = void 0;
/**
 * Copyright (c) 2019, 2024 IBM Corporation.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */
const path = require("path");
exports.INPUT_OPTIONS = {
    FROM_FILE: "Generate from an OpenAPI file",
    FROM_URL: "Generate from a url",
};
exports.MP_REST_CLIENT_VERSION = {
    VERSION_30: "3.0",
    VERSION_20: "2.0",
    VERSION_141: "1.4.1"
};
exports.GENERATOR_JAR_PATH = path.join(__dirname, "../node_modules/@openapitools/openapi-generator-cli/versions/7.5.0.jar");
exports.SPEC_VALIDATION_EXCEPTION = "SpecValidationException";
//# sourceMappingURL=constants.js.map