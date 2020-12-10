"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
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
exports.ManagementUrlHelper = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
class ManagementUrlHelper {
    static getBaseUrl() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._baseUrl) {
                let azCloudDetails = JSON.parse(yield ManagementUrlHelper.executeAzCliCommand('cloud show'));
                const cloudEndpoints = azCloudDetails['endpoints'];
                this._baseUrl = ManagementUrlHelper.getResourceManagerUrl(cloudEndpoints);
            }
            return this._baseUrl;
        });
    }
    static executeAzCliCommand(command, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let azCliPath = yield io.which('az', true);
            let stdout = '';
            let stderr = '';
            try {
                core.debug(`"${azCliPath}" ${command}`);
                yield exec.exec(`"${azCliPath}" ${command}`, args, {
                    silent: true,
                    listeners: {
                        stdout: (data) => {
                            stdout += data.toString();
                        },
                        stderr: (data) => {
                            stderr += data.toString();
                        }
                    }
                });
            }
            catch (error) {
                throw new Error(stderr);
            }
            return stdout;
        });
    }
    static getResourceManagerUrl(cloudEndpoints) {
        if (!cloudEndpoints['resourceManager']) {
            return 'https://management.azure.com';
        }
        // Remove trailing slash.
        return cloudEndpoints['resourceManager'].replace(/\/$/, "");
    }
}
exports.ManagementUrlHelper = ManagementUrlHelper;
