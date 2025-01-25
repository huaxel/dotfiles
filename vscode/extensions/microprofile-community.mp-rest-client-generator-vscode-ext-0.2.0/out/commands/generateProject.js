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
exports.generateProject = void 0;
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
const path = require("path");
const prompts = require("../util/vscodePrompts");
const constants_1 = require("../constants");
const fileUtil = require("../util/file");
const workspace_1 = require("../util/workspace");
function generateProject(clickedFileUri) {
    return __awaiter(this, void 0, void 0, function* () {
        // extension uses a tmp directory to download / generate files into
        let tmpDirPath;
        let inputType;
        // default URI to use when presenting the user a file picker
        // ie. when asking for file or target folder to generate REST client into
        const defaultFilePickerURI = clickedFileUri !== null ? clickedFileUri : (0, workspace_1.getWorkspaceFolder)();
        try {
            const inputMethod = yield prompts.askForInputMethod();
            let inputFileURI;
            let inputURL;
            if (inputMethod === constants_1.INPUT_OPTIONS.FROM_FILE) {
                inputFileURI = yield prompts.askForInputFile(defaultFilePickerURI);
                inputType = "file";
            }
            else if (inputMethod === constants_1.INPUT_OPTIONS.FROM_URL) {
                inputURL = yield prompts.askForInputURL();
                inputType = "url";
            }
            // if neither an input file or input URL are specified exit the generator
            if (inputFileURI === undefined && inputURL === undefined) {
                return;
            }
            // ask for a folder to generate REST client into
            // use the fileURI clicked on by the user as the default if
            // the command was triggered from the file explorer
            const targetDirectory = yield prompts.askForTargetFolder(defaultFilePickerURI);
            if (targetDirectory === undefined) {
                return;
            }
            const packageName = yield prompts.askForPackageName(targetDirectory.fsPath);
            if (packageName === undefined) {
                return;
            }
            // make a tmp directory in the target folder to generate files into
            tmpDirPath = yield fileUtil.generateTempDirectory();
            // if they are using a URL download the file to the temp directory
            if (inputMethod === constants_1.INPUT_OPTIONS.FROM_URL) {
                const requestOptions = {
                    // inputURL must exist if input method is FROM_URL
                    url: inputURL, // eslint-disable-line @typescript-eslint/no-non-null-assertion
                    method: "GET",
                };
                const downloadLocation = path.join(tmpDirPath, "openapi.yaml");
                try {
                    yield fileUtil.downloadFile(requestOptions, downloadLocation);
                    inputFileURI = vscode.Uri.parse(downloadLocation);
                }
                catch (e) {
                    console.error(e);
                    vscode.window.showErrorMessage(`Failed to download file from "${inputURL}" to directory "${downloadLocation}"`);
                    return;
                }
            }
            if (inputFileURI === undefined) {
                return;
            }
            const mpRestClientVersion = yield prompts.askForMPRestClientVersion();
            if (mpRestClientVersion === undefined) {
                return;
            }
            // add .api /.models to package name or just use package api package models
            // if no package name was provided
            const apiPackageName = packageName !== "" ? `${packageName}.api` : "api";
            const modelPackageName = packageName !== "" ? `${packageName}.models` : "models";
            // execute generator in temp dir
            let jarCommand = fileUtil.getJava() +
                " -jar " +
                constants_1.GENERATOR_JAR_PATH +
                " generate " +
                "-p useMultipart=false " +
                "-p microprofileRestClientVersion=" + mpRestClientVersion + " " +
                "-p disableMultipart=true " +
                "-i " +
                inputFileURI.fsPath +
                " -g java --library microprofile -o " +
                tmpDirPath +
                " --api-package " +
                apiPackageName +
                " --model-package " +
                modelPackageName;
            try {
                yield (0, workspace_1.generateRestClient)(jarCommand);
            }
            catch (e) {
                console.error(e);
                let errMsg = e instanceof Error ? e.message : new String(e);
                if (errMsg.includes(jarCommand)) {
                    // get error description returned from executing jar command
                    let errArray = errMsg.trim().split(jarCommand);
                    let err = errArray[1].trim().split("\n")[0];
                    // catch spec validation error
                    if (err.includes(constants_1.SPEC_VALIDATION_EXCEPTION)) {
                        const selection = yield vscode.window.showErrorMessage(`The provided ${inputType} failed the OpenAPI specification validation. Would you like to generate without specification validation?`, ...["Yes", "No"]);
                        if (selection === "Yes") {
                            jarCommand += " --skip-validate-spec";
                            yield (0, workspace_1.generateRestClient)(jarCommand);
                        }
                        else {
                            return;
                        }
                    }
                    else {
                        yield vscode.window.showErrorMessage(`Failed to generate a MicroProfile REST Client interface from the provided ${inputType}: ${err}`);
                        return;
                    }
                }
                else {
                    yield vscode.window.showErrorMessage("Failed to generate a MicroProfile REST Client interface template");
                    return;
                }
            }
            const packagePath = packageName.replace(/\./g, path.sep);
            const generatedRestClientPath = path.resolve(tmpDirPath, "src", "main", "java", packagePath);
            // copy the api/models folder from the generated directory into the target directory
            yield fileUtil.copy(generatedRestClientPath, targetDirectory.fsPath);
            yield vscode.window.showInformationMessage("Successfully generated a MicroProfile REST Client interface template.", ...["OK"]);
            vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Failed to generate a MicroProfile REST Client interface template.");
        }
        finally {
            // remove the tmp directory after if it exists
            if (tmpDirPath !== undefined && (yield fileUtil.exists(tmpDirPath))) {
                try {
                    yield fileUtil.deleteDirectory(tmpDirPath);
                }
                catch (e) {
                    console.error(e);
                    vscode.window.showErrorMessage(`Failed to delete the directory ${tmpDirPath}`);
                }
            }
        }
    });
}
exports.generateProject = generateProject;
//# sourceMappingURL=generateProject.js.map