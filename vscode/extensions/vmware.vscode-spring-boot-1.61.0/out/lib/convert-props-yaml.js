"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.startPropertiesConversionSupport = void 0;
const path = __importStar(require("path"));
const fs_1 = require("fs");
const vscode_1 = require("vscode");
function startPropertiesConversionSupport(extension) {
    extension.subscriptions.push(vscode_1.commands.registerCommand('vscode-spring-boot.props-to-yaml', (uri) => __awaiter(this, void 0, void 0, function* () {
        if (!uri && vscode_1.window.activeTextEditor) {
            const activeUri = vscode_1.window.activeTextEditor.document.uri;
            if (".properties" === path.extname(activeUri.path)) {
                uri = activeUri;
            }
        }
        if (!uri) {
            throw new Error("No '.properties' file selected");
        }
        return yield vscode_1.commands.executeCommand("sts/boot/props-to-yaml", uri.toString(), vscode_1.Uri.file(getTargetFile(uri.path, "yml")).toString(), shouldReplace());
    })), vscode_1.commands.registerCommand('vscode-spring-boot.yaml-to-props', (uri) => __awaiter(this, void 0, void 0, function* () {
        if (!uri && vscode_1.window.activeTextEditor) {
            const activeUri = vscode_1.window.activeTextEditor.document.uri;
            const ext = path.extname(activeUri.path);
            if (".yml" === ext || ".yaml" === ext) {
                uri = activeUri;
            }
        }
        if (!uri) {
            throw new Error("No '.yaml' file selected");
        }
        return yield vscode_1.commands.executeCommand("sts/boot/yaml-to-props", uri.toString(), vscode_1.Uri.file(getTargetFile(uri.path, "properties")).toString(), shouldReplace());
    })));
}
exports.startPropertiesConversionSupport = startPropertiesConversionSupport;
function getTargetFile(sourcePath, ext) {
    const dir = path.dirname(sourcePath);
    const fileName = path.basename(sourcePath);
    const filenameNoExt = path.basename(sourcePath).substring(0, fileName.length - path.extname(fileName).length);
    let targetPath = path.join(dir, `${filenameNoExt}.${ext}`);
    for (let i = 1; i < Number.MAX_SAFE_INTEGER && (0, fs_1.existsSync)(targetPath); i++) {
        targetPath = path.join(dir, `${filenameNoExt}-${i}.${ext}`);
    }
    return targetPath;
}
function shouldReplace() {
    return vscode_1.workspace.getConfiguration("spring.tools.properties").get("replace-converted-file");
}
//# sourceMappingURL=convert-props-yaml.js.map