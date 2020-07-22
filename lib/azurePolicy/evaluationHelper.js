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
exports.saveScanResult = exports.computeBatchCalls = exports.batchCall = void 0;
const core = __importStar(require("@actions/core"));
const httpClient_1 = require("../utils/httpClient");
const fs = __importStar(require("fs"));
const fileHelper = __importStar(require("../utils/fileHelper"));
const ignoreResultHelper_1 = require("../report/ignoreResultHelper");
const utilities_1 = require("../utils/utilities");
const BATCH_MAX_SIZE = 500;
const BATCH_POLL_INTERVAL = 60 * 1000; // 1 min = 60 * 1000ms
const BATCH_POLL_TIMEOUT_DURATION = 120 * 60 * 1000; //5 mins
const CONDITION_MAP = {
    containsKey: "Current value must contain the target value as a key.",
    notContainsKey: "Current value must not contain the target value as a key.",
    contains: "Current value must contain the target value.",
    notContains: "Current value must not contain the target value.",
    equals: "Current value must be equal to the target value.",
    notEquals: "Current value must not be equal to the target value.",
    less: "Current value must be less than the target value.	less or not greaterOrEquals",
    greaterOrEquals: "Current value must be greater than or equal to the target value.	greaterOrEquals or not less",
    greater: "Current value must be greater than the target value.	greater or not lessOrEquals",
    lessOrEquals: "Current value must be less than or equal to the target value.	lessOrEquals or not greater",
    exists: "Current value must exist.",
    notExists: "Current value must not exist.",
    in: "Current value must be in the target value.",
    notIn: "Current value must not be in the target value.",
    like: "Current value must be like the target value.",
    notLike: "Current value must not be like the target value.",
    match: "Current value must case-sensitive match the target value.",
    notMatch: "Current value must case-sensitive not match the target value.",
    matchInsensitively: "Current value must case-insensitive match the target value.",
    notMatchInsensitively: "Current value must case-insensitive not match the target value.",
};
function getPolicyEvaluationDetails(evalData) {
    if (evalData == null || evalData == {}) {
        return "No Evaluation details received";
    }
    if (evalData.evaluatedExpressions == null ||
        evalData.evaluatedExpressions.length == 0) {
        return "No expressions evaluated";
    }
    let finalVal = "{ ";
    let index = 1;
    evalData.evaluatedExpressions.forEach((element) => {
        if (index > 1)
            finalVal = finalVal + ",";
        finalVal =
            finalVal +
                '"' +
                element.path +
                '" : ' +
                JSON.stringify({
                    REASON: CONDITION_MAP[element.operator.toString().toLowerCase()]
                        ? CONDITION_MAP[element.operator.toString().toLowerCase()]
                        : "Not Parsed",
                    CurrentValue: element.expressionValue,
                    Condition: element.operator,
                    ExpectedValue: JSON.stringify(element.targetValue)
                        .replace("[", "(")
                        .replace("]", ")"),
                });
        index++;
    });
    finalVal = finalVal + " }";
    while (finalVal.indexOf("[") > -1 || finalVal.indexOf("]") > -1) {
        finalVal = finalVal.replace("[", "(").replace("]", ")");
    }
    //core.debug(`\nPolicyEvaluationDetails parsed: ${finalVal}`);
    return JSON.parse(finalVal);
}
function batchCall(batchUrl, batchMethod, batchRequests, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let batchWebRequest = new httpClient_1.WebRequest();
        batchWebRequest.method =
            batchMethod && batchMethod.length > 0 ? batchMethod : "POST";
        batchWebRequest.uri =
            batchUrl && batchUrl.length > 0
                ? batchUrl
                : `https://management.azure.com/batch?api-version=2020-06-01`;
        batchWebRequest.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
        };
        batchWebRequest.body =
            batchRequests && batchRequests.length > 0
                ? JSON.stringify({ requests: batchRequests })
                : "";
        core.debug(`Batch request :: Batch URL: ${batchWebRequest.uri} # Requests: ${batchRequests.length}`);
        if (batchRequests.length > 0) {
            core.debug(`\tRequest URL sample: => ${batchRequests[0].url}`);
        }
        return yield httpClient_1.sendRequest(batchWebRequest)
            .then((response) => {
            if (response.statusCode == 200 || response.statusCode == 202) {
                core.debug(`Batch response :: Status: ${response.statusCode} Location: ${response.headers["location"]} Body: ${response.body}`);
                return Promise.resolve(response);
            }
            return Promise.reject(`An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
        })
            .catch((error) => {
            return Promise.reject(error);
        });
    });
}
exports.batchCall = batchCall;
function processCreatedResponses(receivedResponses, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let finalResponses = [];
        let responseNextPage = [];
        let pendingRequests = [];
        let values;
        try {
            if (receivedResponses && receivedResponses.length > 0) {
                receivedResponses = yield Promise.all(receivedResponses.map((pendingResponse) => __awaiter(this, void 0, void 0, function* () {
                    //Way to do async forEach
                    values = [];
                    if (pendingResponse.statusCode == 200 &&
                        pendingResponse != null &&
                        pendingResponse.body != null) {
                        values = pendingResponse.body.responses
                            ? pendingResponse.body.responses
                            : pendingResponse.body.value;
                        let nextPageLink = pendingResponse.body.nextLink
                            ? pendingResponse.body.nextLink
                            : null;
                        if (nextPageLink != null) {
                            pendingRequests.push({ url: nextPageLink });
                        }
                        utilities_1.printPartitionedDebugLog(`Saving ${values.length} completed responses.`);
                        values.forEach((value) => {
                            finalResponses.push(value); //Saving to final response array
                            //Will be called in next set of batch calls to get the paginated responses for each request within batch call
                            if (value.content["@odata.nextLink"] != null) {
                                responseNextPage.push({
                                    scope: value.content["@odata.nextLink"],
                                });
                            }
                        });
                    }
                    return { values: values };
                })));
            }
        }
        catch (error) {
            return Promise.reject(`Error in getting batch response pages. ${error}`);
        }
        finally {
            let resultObj = {
                finalResponses: finalResponses,
                pendingRequests: pendingRequests,
                responseNextPage: responseNextPage,
            };
            return resultObj;
        }
    });
}
function pollPendingResponses(pendingResponses, token, sleepInterval) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let url;
            if (pendingResponses && pendingResponses.length > 0) {
                core.debug(`Polling requests # ${pendingResponses.length}  ==>`);
                yield utilities_1.sleep(sleepInterval); // Delay before next poll
                pendingResponses = yield Promise.all(pendingResponses.map((pendingResponse) => __awaiter(this, void 0, void 0, function* () {
                    url =
                        pendingResponse.headers && pendingResponse.headers.location
                            ? pendingResponse.headers.location
                            : pendingResponse.url;
                    return yield batchCall(url, "GET", [], token).then((response) => {
                        if (response.statusCode == 200) {
                            //Will be saved in next iteration
                            return response;
                        }
                        if (response.statusCode == 202) {
                            //Will be polled in next iteration
                            return pendingResponse;
                        }
                    });
                })));
            }
        }
        catch (error) {
            return Promise.reject(`${error}`);
        }
        finally {
            return pendingResponses;
        }
    });
}
function computeBatchCalls(uri, method, commonHeaders, polls, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let pendingPolls = polls;
        let requests = [];
        let requestNum = 0;
        let finalResponses = [];
        //For paginated response fetching ($skipToken)
        while (pendingPolls.length > 0) {
            //Creating total request list
            pendingPolls.forEach((poll) => {
                let scope = poll.scope;
                requests.push({
                    content: null,
                    httpMethod: method,
                    name: requestNum++,
                    requestHeaderDetails: { commandName: "Microsoft_Azure_Policy." },
                    url: uri.replace("${scope}", scope),
                });
            });
            pendingPolls = [];
            let batchResponses = [];
            let pendingResponses = [];
            let completedResponses = [];
            //Sending batch calls for all records in pendingPolls in batches of BATCH_MAX_SIZE
            let start = 0;
            let end = start + BATCH_MAX_SIZE >= requests.length
                ? requests.length
                : start + BATCH_MAX_SIZE;
            try {
                while (end <= requests.length && start < end) {
                    core.debug(`Getting results for requests # ${start} to # ${end - 1}  ==>`);
                    yield batchCall("", "", requests.slice(start, end), token).then((response) => {
                        batchResponses.push(response);
                    });
                    start = end;
                    end =
                        start + BATCH_MAX_SIZE > requests.length
                            ? requests.length
                            : start + BATCH_MAX_SIZE;
                }
            }
            catch (error) {
                return Promise.reject(`Error in fetching.  ${error}`);
            }
            //Evaluating all batch responses
            let hasPollTimedout = false;
            let pollTimeoutId = setTimeout(() => {
                hasPollTimedout = true;
            }, BATCH_POLL_TIMEOUT_DURATION);
            pendingResponses = batchResponses.filter((response) => {
                return response.statusCode == 202;
            });
            completedResponses.push(...batchResponses.filter((response) => {
                return response.statusCode == 200;
            }));
            try {
                //Run until all batch-responses are CREATED
                while (pendingResponses &&
                    pendingResponses.length > 0 &&
                    !hasPollTimedout) {
                    //Polling remaining batch-responses with status = ACCEPTED
                    yield pollPendingResponses(pendingResponses, token, BATCH_POLL_INTERVAL).then((polledResponses) => {
                        pendingResponses = polledResponses.filter((response) => {
                            return response.statusCode == 202;
                        });
                        completedResponses.push(...polledResponses.filter((response) => {
                            return response.statusCode == 200;
                        }));
                    });
                    console.debug(`Status :: Pending ${pendingResponses.length} responses. | Completed ${completedResponses.length} responses.`);
                    if (hasPollTimedout &&
                        pendingResponses &&
                        pendingResponses.length > 0) {
                        console.log("Polling responses timed-out.");
                        console.log(`Pending responses : ${pendingResponses.length}`);
                        break;
                    }
                }
            }
            catch (error) {
                return Promise.reject(`Error in polling. ${error}`);
            }
            finally {
                if (!hasPollTimedout) {
                    clearTimeout(pollTimeoutId);
                }
            }
            pendingResponses = [];
            //Getting results
            try {
                yield processCreatedResponses(completedResponses, token).then((intermediateResult) => {
                    finalResponses.push(...intermediateResult.finalResponses);
                    pendingResponses.push(...intermediateResult.pendingRequests);
                    pendingPolls.push(...intermediateResult.responseNextPage); //For getting paginated responses
                });
                while (pendingResponses &&
                    pendingResponses.length > 0 &&
                    !hasPollTimedout) {
                    //Getting batch responses nextPage
                    completedResponses = [];
                    yield pollPendingResponses(pendingResponses, token, 0).then((polledResponses) => {
                        pendingResponses = polledResponses.filter((response) => {
                            return response.statusCode == 202;
                        }); //SHOULD BE ZERO HERE
                        completedResponses.push(...polledResponses.filter((response) => {
                            return response.statusCode == 200;
                        }));
                    });
                    console.debug(`Status :: Pending ${pendingResponses.length} responses. | Completed ${completedResponses.length} responses.`);
                    pendingResponses = [];
                    yield processCreatedResponses(completedResponses, token).then((intermediateResult) => {
                        finalResponses.push(...intermediateResult.finalResponses);
                        pendingResponses.push(...intermediateResult.pendingRequests);
                        pendingPolls.push(...intermediateResult.responseNextPage);
                    });
                }
            }
            catch (error) {
                return Promise.reject(`Error in saving results after poll. ${error}`);
            }
            finally {
                if (!hasPollTimedout) {
                    clearTimeout(pollTimeoutId);
                }
            }
            uri = "${scope}";
            requests = [];
            requestNum = 0;
            core.debug(`# of paginated calls: ${pendingPolls.length}`);
        }
        core.debug(`Getting batch calls final responses # :: ${finalResponses.length}`);
        return Promise.resolve(finalResponses);
    });
}
exports.computeBatchCalls = computeBatchCalls;
function saveScanResult(polls, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let scanResults = [];
        let scopes = [];
        let resourceIds = [];
        //Get query results for each poll.scope
        let scanResultUrl = "https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$filter=complianceState eq 'NonCompliant'&$apply=groupby((resourceId),aggregate($count as Count))&$select=ResourceId,Count";
        let policyEvalUrl = "https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$expand=PolicyEvaluationDetails";
        //First batch call
        utilities_1.printPartitionedDebugLog("First set of batch calls - Fetching list of unique non-compliant resourceIds :: ");
        yield computeBatchCalls(scanResultUrl, "POST", null, polls, token)
            .then((responseList) => {
            responseList.forEach((resultsObject) => {
                if (resultsObject.httpStatusCode == 200) {
                    resourceIds.push(...resultsObject.content.value.map((result) => {
                        return result.resourceId;
                    }));
                }
            });
        })
            .catch((error) => {
            throw Error(`Error in first batch call. ${error}`);
        });
        core.debug("Scopes length : " + resourceIds.length);
        // Getting unique scopes and ignoring
        let result = true;
        let isResourceIgnored = false;
        utilities_1.printPartitionedText(`Ignoring resourceIds : `);
        scopes = [...new Set(resourceIds)]
            .filter((item) => {
            result = true;
            if (ignoreResultHelper_1.ignoreScope(item)) {
                console.log(`${item}`);
                result = false;
                isResourceIgnored = true;
            }
            return result;
        })
            .map((item) => {
            return { scope: item };
        });
        if (!isResourceIgnored) {
            console.log(`No resourceId ignored`);
        }
        core.debug("# of Unique resourceIds scanned : " + scopes.length);
        utilities_1.printPartitionedDebugLog("Second set of batch calls - Fetching all details of non-compliant resourceIds::");
        let sum = 0;
        yield computeBatchCalls(policyEvalUrl, "POST", null, scopes, token)
            .then((responseList) => {
            core.debug("# of responses scanned : " + responseList.length);
            responseList.forEach((resultsObject) => {
                if (resultsObject.httpStatusCode == 200) {
                    sum = sum + resultsObject.content.value.length;
                    scanResults.push(...(resultsObject.content.value
                        .map((resultJson) => {
                        let policyEvaluationDetails = {};
                        try {
                            policyEvaluationDetails = getPolicyEvaluationDetails(resultJson.policyEvaluationDetails);
                        }
                        catch (error) {
                            console.error(`An error has occured while parsing policyEvaluationDetails [${policyEvaluationDetails}]. Error: ${error}.`);
                        }
                        return {
                            resourceId: resultJson.resourceId,
                            policyAssignmentId: resultJson.policyAssignmentId,
                            policyDefinitionId: resultJson.policyDefinitionId,
                            resourceLocation: resultJson.resourceLocation,
                            resourceType: resultJson.resourceType,
                            complianceState: resultJson.complianceState,
                            policyEvaluation: policyEvaluationDetails,
                        };
                    })));
                }
            });
            core.debug("# of records saved : " + scanResults.length + " || " + sum); 
        })
            .catch((error) => {
            throw Error(`Error in second batch call. ${error}`);
        });
        //Writing to file non-compliant records from every successful poll, for every poll-round
        try {
            if (scanResults.length > 0) {
                const scanReportPath = fileHelper.getScanReportPath();
                fs.appendFileSync(scanReportPath, JSON.stringify(scanResults, null, 2));
                utilities_1.printPartitionedDebugLog(`Saved ${scanResults.length} records to intermediate file.`);
            }
        }
        catch (error) {
            throw Error(`An error has occured while recording of compliance scans to file. Error: ${error}.`);
        }
    });
}
exports.saveScanResult = saveScanResult;
