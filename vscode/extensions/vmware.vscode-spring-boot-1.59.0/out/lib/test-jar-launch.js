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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTestJarSupport = void 0;
const vscode_1 = require("vscode");
const debug_config_provider_1 = require("./debug-config-provider");
const path_1 = __importDefault(require("path"));
const os_1 = require("os");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const ENV_TESTJAR_ARTIFACT_PREFIX = "TESTJARS_ARTIFACT_";
class TestJarDebugConfigProvider {
    resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token) {
        return __awaiter(this, void 0, void 0, function* () {
            // TestJar launch support
            if (debug_config_provider_1.TEST_RUNNER_MAIN_CLASSES.includes(debugConfiguration.mainClass) && isTestJarsOnClasspath(debugConfiguration)) {
                const projects = yield vscode_1.commands.executeCommand("sts/spring-boot/executableBootProjects");
                let env = debugConfiguration.env;
                if (!env) {
                    env = {};
                    debugConfiguration.env = env;
                }
                const projectsWithErrors = [];
                // Create all project classparth data files and add env vars for workspace projects
                yield Promise.all(projects.filter(p => p.gav).map((p) => __awaiter(this, void 0, void 0, function* () {
                    const envName = this.createEnvVarName(p);
                    if (!env[envName]) {
                        try {
                            env[envName] = yield this.createFile(p);
                        }
                        catch (error) {
                            projectsWithErrors.push(p);
                        }
                    }
                })));
                if (projectsWithErrors.length > 0) {
                    const projectStr = projectsWithErrors.map(p => `'${p.name}'`);
                    vscode_1.window.showWarningMessage(`TestJar Support: Could not provide data for workspace projects: ${projectStr}`);
                }
            }
            return debugConfiguration;
        });
    }
    createEnvVarName(project) {
        return `${ENV_TESTJAR_ARTIFACT_PREFIX}${project.gav.replace(/:/g, "_")}`;
    }
    createFile(project) {
        return __awaiter(this, void 0, void 0, function* () {
            const filePath = path_1.default.join((0, os_1.tmpdir)(), `${project.gav.replace(/:/g, "_")}-${(0, crypto_1.randomUUID)()}`);
            yield fs.writeFile(filePath, `# the main class to invoke\nmain=${project.mainClass}\n# the classpath to use delimited by the OS specific delimiters\nclasspath=${project.classpath.join(path_1.default.delimiter)}`, function (err) {
                if (err) {
                    throw Error();
                }
            });
            return filePath;
        });
    }
}
function startTestJarSupport() {
    return (0, debug_config_provider_1.hookListenerToBooleanPreference)('boot-java-vscode-only.test-jars', () => vscode_1.Disposable.from(vscode_1.debug.onDidTerminateDebugSession(cleanupDebugSession), vscode_1.debug.registerDebugConfigurationProvider('java', new TestJarDebugConfigProvider(), vscode_1.DebugConfigurationProviderTriggerKind.Initial), new vscode_1.Disposable(() => cleanupDebugSession(vscode_1.debug.activeDebugSession)) // If VSCode is shutdown then clean active debug session if it satisfies conditions
    ));
}
exports.startTestJarSupport = startTestJarSupport;
function cleanupDebugSession(session) {
    return __awaiter(this, void 0, void 0, function* () {
        // Handle termination of a Boot app with TestJars on the classpath
        if (session.type === 'java' && debug_config_provider_1.TEST_RUNNER_MAIN_CLASSES.includes(session.configuration.mainClass) && isTestJarsOnClasspath(session.configuration) && session.configuration.env) {
            yield Promise.all(Object.keys(session.configuration.env).filter(k => k.startsWith(ENV_TESTJAR_ARTIFACT_PREFIX)).map(k => fs.rm(session.configuration.env[k], () => { })));
        }
    });
}
function isTestJarsOnClasspath(debugConfiguration) {
    if (Array.isArray(debugConfiguration.classPaths)) {
        return !!debugConfiguration.classPaths.find(isTestJarFile);
    }
    return false;
}
function isTestJarFile(f) {
    const fileName = path_1.default.basename(f || "");
    if (/^spring-boot-testjars-\d+\.\d+\.\d+(.*)?.jar$/.test(fileName)) {
        return true;
    }
    return false;
}
//# sourceMappingURL=test-jar-launch.js.map