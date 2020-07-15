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
exports.getFileJson = exports.createCheckRun = void 0;
const fs = __importStar(require("fs"));
const core = __importStar(require("@actions/core"));
const client_1 = require("./client");
function createCheckRun() {
    return __awaiter(this, void 0, void 0, function* () {
        const payload = {
            head_sha: getHeadSha(),
            name: `Policy compliance Scan`,
            status: "completed",
            conclusion: "failure",
            output: {
                title: "Policy compliance Scan",
                summary: "Policy compliance Scan failed",
                text: "Policy compliance scan failed. There are 1 or more resources which are not compliant.\nPlease visit [azure portal](https://ms.portal.azure.com/#blade/Microsoft_Azure_Security/SecurityMenuBlade/12) to see more details."
            }
        };
        const repo = process.env['GITHUB_REPOSITORY'];
        const checkRunUrl = `https://api.github.com/repos/${repo}/check-runs`;
        const webRequest = new client_1.WebRequest();
        webRequest.method = "POST";
        webRequest.uri = checkRunUrl;
        webRequest.body = JSON.stringify(payload);
        const token = core.getInput("token");
        webRequest.headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.antiope-preview+json'
        };
        //console.log(`Creating check run. Name: ${payload['name']}, head_sha: ${payload['head_sha']}`);
        const response = yield client_1.sendRequest(webRequest);
        if (response.statusCode != client_1.StatusCodes.CREATED) {
            throw Error(`Statuscode: ${response.statusCode}, StatusMessage: ${response.statusMessage}, Url: ${checkRunUrl}, head_sha: ${payload['head_sha']}`);
        }
        console.log(`Created check run. Url: ${response.body['html_url']}`);
    });
}
exports.createCheckRun = createCheckRun;
function getHeadSha() {
    return isPullRequestTrigger() ? getPullRequestHeadSha() : process.env['GITHUB_SHA'];
}
function isPullRequestTrigger() {
    return process.env['GITHUB_EVENT_NAME'] === 'pull_request';
}
function getPullRequestHeadSha() {
    const eventJson = getEventJson();
    return eventJson["pull_request"]["head"]["sha"];
}
function getEventJson() {
    const eventPath = process.env['GITHUB_EVENT_PATH'];
    let eventJson;
    if (eventPath) {
        eventJson = getFileJson(eventPath);
        core.debug(`Event json: ${eventJson}`);
    }
    return eventJson;
}
function getFileJson(path) {
    try {
        const rawContent = fs.readFileSync(path, 'utf-8');
        return JSON.parse(rawContent);
    }
    catch (ex) {
        throw new Error(`An error occured while parsing the contents of the file: ${path}. Error: ${ex}`);
    }
}
exports.getFileJson = getFileJson;
