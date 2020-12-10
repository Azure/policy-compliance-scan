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
exports.pollForCompletion = exports.triggerOnDemandScan = void 0;
const core = __importStar(require("@actions/core"));
const httpClient_1 = require("../utils/httpClient");
const resultScanner = __importStar(require("./evaluationHelper"));
const utilities_1 = require("../utils/utilities");
const azAuthentication_1 = require("../auth/azAuthentication");
const managementUrlHelper_1 = require("../auth/managementUrlHelper");
function triggerOnDemandScan() {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield azAuthentication_1.getAccessToken();
        const scopesInput = core.getInput('scopes');
        const scopes = scopesInput ? scopesInput.split('\n') : [];
        let polls = [];
        for (const scope of scopes) {
            const pollLocation = yield triggerScan(scope, token);
            // If pollLocation is empty, it means the scan is already completed. Polling is not required.
            polls.push({
                scope: scope,
                location: pollLocation,
                isCompleted: !pollLocation,
            });
        }
        return polls;
    });
}
exports.triggerOnDemandScan = triggerOnDemandScan;
function triggerScan(scope, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let triggerScanUrl = `${yield managementUrlHelper_1.ManagementUrlHelper.getBaseUrl()}${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01`;
        let webRequest = new httpClient_1.WebRequest();
        webRequest.method = "POST";
        webRequest.uri = triggerScanUrl;
        webRequest.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
        };
        utilities_1.printPartitionedText(`Triggering scan. URL: ${triggerScanUrl}`);
        return httpClient_1.sendRequest(webRequest)
            .then((response) => {
            if (response.statusCode == httpClient_1.StatusCodes.OK) {
                // If scan is done, return empty poll url
                return Promise.resolve("");
            }
            else if (response.statusCode == httpClient_1.StatusCodes.ACCEPTED) {
                if (response.headers["location"]) {
                    let pollLocation = response.headers["location"];
                    console.log(`Scan triggered successfully.\nPoll URL: ${pollLocation}`);
                    return Promise.resolve(pollLocation);
                }
                else {
                    return Promise.reject(`Location header missing in response.\nResponse body: ${JSON.stringify(response.body)}`);
                }
            }
            else {
                return Promise.reject(`Some error occured. Scope: ${scope}, StatusCode: ${response.statusCode}, Response body: ${JSON.stringify(response.body)}`);
            }
        })
            .catch((error) => {
            console.log("An error occured while triggering the scan. Error: ", error);
            return Promise.reject(error);
        });
    });
}
function isScanCompleted(poll, token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (poll.isCompleted) {
            return Promise.resolve(true);
        }
        const pollUrl = poll.location;
        let webRequest = new httpClient_1.WebRequest();
        webRequest.method = "GET";
        webRequest.uri = pollUrl;
        webRequest.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
        };
        return httpClient_1.sendRequest(webRequest)
            .then((response) => {
            if (response.statusCode == httpClient_1.StatusCodes.OK) {
                return Promise.resolve(true);
            }
            else if (response.statusCode == httpClient_1.StatusCodes.ACCEPTED) {
                return Promise.resolve(false);
            }
            else {
                return Promise.reject(`An error occured while polling the scan status. Poll url: ${pollUrl}, StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
            }
        })
            .catch((error) => {
            console.log(error);
            return Promise.reject(error);
        });
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function pollForCompletion(polls) {
    return __awaiter(this, void 0, void 0, function* () {
        utilities_1.printPartitionedText("Starting to poll for scan statuses. Polling details:");
        const token = yield azAuthentication_1.getAccessToken();
        polls.forEach((poll) => {
            console.log(`scope: ${poll.scope}\nurl: ${poll.location}\n`);
        });
        let pendingPolls = polls;
        const pollInterval = 60 * 1000; // 60000ms = 1min
        try {
            utilities_1.printPartitionedText(`Poll interval (ms):: ${pollInterval}`);
            while (pendingPolls.length > 0) {
                let pendingPollsNew = [];
                let completedPolls = [];
                for (const poll of pendingPolls) {
                    const isCompleted = yield isScanCompleted(poll, token);
                    if (isCompleted) {
                        completedPolls.push(poll);
                    }
                    else {
                        pendingPollsNew.push(poll);
                    }
                }
                pendingPolls = pendingPollsNew;
                let startTime = new Date();
                let endTime = new Date();
                if (completedPolls.length > 0) {
                    utilities_1.printPartitionedDebugLog(`Results saving ...`);
                    yield resultScanner.saveScanResult(completedPolls, token).then(() => {
                        endTime = new Date();
                        utilities_1.printPartitionedDebugLog(`Results saved. Time taken in ms:: ${endTime.valueOf() - startTime.valueOf()}`);
                    });
                }
                let remainingTime = pollInterval - (endTime.valueOf() - startTime.valueOf());
                //If time remains after storing success results then wait for it till the pollinterval is over
                if (remainingTime > 0 && pendingPolls.length > 0) {
                    yield sleep(remainingTime);
                }
            }
        }
        catch (error) {
            console.log(`An error has occured while polling the status of compliance scans. \nError: ${error}.\nPending polls:`);
            pendingPolls.forEach((pendingPoll) => {
                console.log(pendingPoll);
            });
            throw Error(error);
        }
    });
}
exports.pollForCompletion = pollForCompletion;
