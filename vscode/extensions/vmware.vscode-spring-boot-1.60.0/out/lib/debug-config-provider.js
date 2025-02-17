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
exports.startDebugSupport = exports.hookListenerToBooleanPreference = exports.TEST_RUNNER_MAIN_CLASSES = void 0;
const vscode_1 = require("vscode");
const path = __importStar(require("path"));
const ps_list_1 = __importDefault(require("ps-list"));
const launch_util_1 = require("@pivotal-tools/commons-vscode/lib/launch-util");
const portfinder_1 = require("portfinder");
const JMX_VM_ARG = '-Dspring.jmx.enabled=';
const ACTUATOR_JMX_EXPOSURE_ARG = '-Dmanagement.endpoints.jmx.exposure.include=';
const ADMIN_VM_ARG = '-Dspring.application.admin.enabled=';
const BOOT_PROJECT_ARG = '-Dspring.boot.project.name=';
const RMI_HOSTNAME = '-Djava.rmi.server.hostname=localhost';
const JMX_PORT_ARG = '-Dcom.sun.management.jmxremote.port=';
exports.TEST_RUNNER_MAIN_CLASSES = [
    'org.eclipse.jdt.internal.junit.runner.RemoteTestRunner',
    'com.microsoft.java.test.runner.Launcher'
];
class SpringBootDebugConfigProvider {
    resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token) {
        return __awaiter(this, void 0, void 0, function* () {
            // Running app live hovers support
            if (!exports.TEST_RUNNER_MAIN_CLASSES.includes(debugConfiguration.mainClass) && isActuatorOnClasspath(debugConfiguration)) {
                if (typeof debugConfiguration.vmArgs === 'string') {
                    if (debugConfiguration.vmArgs.indexOf(JMX_VM_ARG) < 0) {
                        debugConfiguration.vmArgs += ` ${JMX_VM_ARG}true`;
                    }
                    if (debugConfiguration.vmArgs.indexOf(ACTUATOR_JMX_EXPOSURE_ARG) < 0) {
                        debugConfiguration.vmArgs += ` ${ACTUATOR_JMX_EXPOSURE_ARG}*`;
                    }
                    if (debugConfiguration.vmArgs.indexOf(ADMIN_VM_ARG) < 0) {
                        debugConfiguration.vmArgs += ` ${ADMIN_VM_ARG}true`;
                    }
                    if (debugConfiguration.vmArgs.indexOf(BOOT_PROJECT_ARG) < 0) {
                        debugConfiguration.vmArgs += ` ${BOOT_PROJECT_ARG}${debugConfiguration.projectName}`;
                    }
                    if (debugConfiguration.vmArgs.indexOf(RMI_HOSTNAME) < 0) {
                        debugConfiguration.vmArgs += ` ${RMI_HOSTNAME}`;
                    }
                    if (debugConfiguration.vmArgs.indexOf(JMX_PORT_ARG) < 0) {
                        debugConfiguration.vmArgs += ` ${JMX_PORT_ARG}${yield (0, portfinder_1.getPortPromise)({
                            startPort: 10000
                        })} -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false`;
                    }
                }
                else {
                    debugConfiguration.vmArgs = `${JMX_VM_ARG}true ${ACTUATOR_JMX_EXPOSURE_ARG}* ${ADMIN_VM_ARG}true ${BOOT_PROJECT_ARG}${debugConfiguration.projectName} ${RMI_HOSTNAME} ${JMX_PORT_ARG}${yield (0, portfinder_1.getPortPromise)({
                        startPort: 10000
                    })} -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false`;
                }
            }
            return debugConfiguration;
        });
    }
}
function hookListenerToBooleanPreference(setting, listenerCreator) {
    const listenableSetting = new launch_util_1.ListenablePreferenceSetting(setting);
    let listener = listenableSetting.value ? listenerCreator() : undefined;
    listenableSetting.onDidChangeValue(() => {
        if (listenableSetting.value) {
            if (!listener) {
                listener = listenerCreator();
            }
        }
        else {
            if (listener) {
                listener.dispose();
                listener = undefined;
            }
        }
    });
    return {
        dispose: () => {
            if (listener) {
                listener.dispose();
            }
            listenableSetting.dispose();
        }
    };
}
exports.hookListenerToBooleanPreference = hookListenerToBooleanPreference;
function startDebugSupport() {
    return vscode_1.Disposable.from(hookListenerToBooleanPreference('boot-java.live-information.automatic-connection.on', () => vscode_1.debug.registerDebugConfigurationProvider('java', new SpringBootDebugConfigProvider(), vscode_1.DebugConfigurationProviderTriggerKind.Initial)), vscode_1.debug.onDidReceiveDebugSessionCustomEvent(handleCustomDebugEvent), vscode_1.debug.onDidTerminateDebugSession(handleTerminateDebugSession));
}
exports.startDebugSupport = startDebugSupport;
function handleCustomDebugEvent(e) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        if (((_a = e.session) === null || _a === void 0 ? void 0 : _a.type) === 'java' && ((_b = e === null || e === void 0 ? void 0 : e.body) === null || _b === void 0 ? void 0 : _b.type) === 'processid') {
            const debugConfiguration = e.session.configuration;
            if (canConnect(debugConfiguration)) {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    const pid = yield getAppPid(e.body);
                    const vmArgs = debugConfiguration.vmArgs;
                    let idx = vmArgs.indexOf(JMX_PORT_ARG) + JMX_PORT_ARG.length;
                    let jmxPort = "";
                    for (; idx < vmArgs.length && vmArgs.charAt(idx) <= "9" && vmArgs.charAt(idx) >= "0"; idx++) {
                        jmxPort += vmArgs.charAt(idx);
                    }
                    yield vscode_1.commands.executeCommand("vscode-spring-boot.live.activate", {
                        host: "127.0.0.1",
                        port: null,
                        urlScheme: "http",
                        jmxurl: `service:jmx:rmi:///jndi/rmi://127.0.0.1:${jmxPort}/jmxrmi`,
                        manualConnect: true,
                        processId: pid.toString(),
                        processName: debugConfiguration.mainClass,
                        projectName: debugConfiguration.projectName
                    });
                    if (vscode_1.workspace.getConfiguration("boot-java.live-information.automatic-connection").get("on")) {
                        yield vscode_1.commands.executeCommand("vscode-spring-boot.live.show.active");
                    }
                }), 500);
            }
        }
    });
}
function handleTerminateDebugSession(session) {
    vscode_1.commands.executeCommand('vscode-spring-boot.live.deactivate');
}
function getAppPid(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e.processId && e.processId > 0) {
            return e.processId;
        }
        else if (e.shellProcessId) {
            const processes = yield (0, ps_list_1.default)();
            const appProcess = processes.find(p => p.ppid === e.shellProcessId);
            if (appProcess) {
                return appProcess.pid;
            }
            throw Error(`No child process found for parent shell process with pid = ${e.shellProcessId}`);
        }
        else {
            throw Error('No pid or parent shell process id available');
        }
    });
}
function isActuatorOnClasspath(debugConfiguration) {
    if (Array.isArray(debugConfiguration.classPaths)) {
        return !!debugConfiguration.classPaths.find(isActuatorJarFile);
    }
    return false;
}
function isActuatorJarFile(f) {
    const fileName = path.basename(f || "");
    if (/^spring-boot-actuator-\d+\.\d+\.\d+(.*)?.jar$/.test(fileName)) {
        return true;
    }
    return false;
}
function canConnect(debugConfiguration) {
    if (!exports.TEST_RUNNER_MAIN_CLASSES.includes(debugConfiguration.mainClass) && isActuatorOnClasspath(debugConfiguration)) {
        return typeof debugConfiguration.vmArgs === 'string'
            && debugConfiguration.vmArgs.indexOf(`${JMX_VM_ARG}true`) >= 0
            && debugConfiguration.vmArgs.indexOf(JMX_PORT_ARG) >= 0
            && debugConfiguration.vmArgs.indexOf(`${ADMIN_VM_ARG}true`) >= 0;
    }
    return false;
}
//# sourceMappingURL=debug-config-provider.js.map