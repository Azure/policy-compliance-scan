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
exports.getScanResultForScope = exports.createCSV = exports.printFormattedOutput = exports.getScanResult = exports.batchCall = exports.JSON_FILENAME = exports.CSV_FILENAME = void 0;
const client_1 = require("./client");
const fs = __importStar(require("fs"));
const fileHelper = __importStar(require("./fileHelper"));
const table = __importStar(require("table"));
const path_1 = require("path");
const ignoreResultHelper_1 = require("./ignoreResultHelper");
const Utility_1 = require("./Utility");
const KEY_RESOURCE_ID = "resourceId";
const KEY_POLICY_ASSG_ID = "policyAssignmentId";
const KEY_POLICY_DEF_ID = "policyDefinitionId";
const KEY_RESOURCE_TYPE = "resourceType";
const KEY_RESOURCE_LOCATION = "resourceLocation";
const KEY_COMPLIANCE_STATE = "complianceState";
const KEY_POLICY_EVAL = "policyEvaluation";
const TITLE_RESOURCE_ID = "RESOURCE_ID";
const TITLE_POLICY_ASSG_ID = "POLICY_ASSG_ID";
const TITLE_POLICY_DEF_ID = "POLICY_DEF_ID";
const TITLE_RESOURCE_TYPE = "RESOURCE_TYPE";
const TITLE_RESOURCE_LOCATION = "RESOURCE_LOCATION";
const TITLE_COMPLIANCE_STATE = "COMPLIANCE_STATE";
const TITLE_POLICY_EVAL = "POLICY_EVALUATION";
const BATCH_MAX_SIZE = 500;
exports.CSV_FILENAME = 'ScanReport.csv';
exports.JSON_FILENAME = 'scanReport.json';
const CONDITION_MAP = {
    'containsKey': 'Current value must contain the target value as a key.',
    'notContainsKey': 'Current value must not contain the target value as a key.',
    'contains': 'Current value must contain the target value.',
    'notContains': 'Current value must not contain the target value.',
    'equals': 'Current value must be equal to the target value.',
    'notEquals': 'Current value must not be equal to the target value.',
    'less': 'Current value must be less than the target value.	less or not greaterOrEquals',
    'greaterOrEquals': 'Current value must be greater than or equal to the target value.	greaterOrEquals or not less',
    'greater': 'Current value must be greater than the target value.	greater or not lessOrEquals',
    'lessOrEquals': 'Current value must be less than or equal to the target value.	lessOrEquals or not greater',
    'exists': 'Current value must exist.',
    'notExists': 'Current value must not exist.',
    'in': 'Current value must be in the target value.',
    'notIn': 'Current value must not be in the target value.',
    'like': 'Current value must be like the target value.',
    'notLike': 'Current value must not be like the target value.',
    'match': 'Current value must case-sensitive match the target value.',
    'notMatch': 'Current value must case-sensitive not match the target value.',
    'matchInsensitively': 'Current value must case-insensitive match the target value.',
    'notMatchInsensitively': 'Current value must case-insensitive not match the target value.'
};
function getPolicyEvaluationDetails(evalData) {
    if (evalData == null || evalData == {}) {
        return "No Evaluation details received";
    }
    if (evalData.evaluatedExpressions == null || evalData.evaluatedExpressions.length == 0) {
        return "No expressions evaluated";
    }
    let finalVal = '{ ';
    let index = 1;
    evalData.evaluatedExpressions.forEach(element => {
        if (index > 1)
            finalVal = finalVal + ',';
        finalVal = finalVal + '\"' + element.path + '\" : ' + JSON.stringify({
            'REASON': (CONDITION_MAP[element.operator.toString().toLowerCase()] ? CONDITION_MAP[element.operator.toString().toLowerCase()] : 'Not Parsed'),
            'CurrentValue': element.expressionValue,
            'Condition': element.operator,
            'ExpectedValue': JSON.stringify(element.targetValue).replace("[", "(").replace("]", ")")
        });
        index++;
    });
    finalVal = finalVal + ' }';
    while (finalVal.indexOf('[') > -1 || finalVal.indexOf(']') > -1) {
        finalVal = finalVal.replace("[", "(").replace("]", ")");
    }
    //console.log(`\nPolicyEvaluationDetails parsed: ${finalVal}`);
    return JSON.parse(finalVal);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function batchCall(uri, method, commonHeaders, polls, token) {
    return __awaiter(this, void 0, void 0, function* () {
        //printPartitionedText(`Batch calls for uri:: ${uri}`)
        let resultWebRequest = new client_1.WebRequest();
        resultWebRequest.method = 'GET';
        resultWebRequest.headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
        };
        let batchCallUrl = `https://management.azure.com/batch?api-version=2020-06-01`;
        let batchWebRequest = new client_1.WebRequest();
        batchWebRequest.method = 'POST';
        batchWebRequest.uri = batchCallUrl;
        batchWebRequest.headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
        };
        let requests = [];
        let requestNum = 0;
        polls.forEach(poll => {
            let scope = poll.scope;
            requests.push({
                'content': null,
                'httpMethod': method,
                'name': requestNum++,
                'requestHeaderDetails': { "commandName": "Microsoft_Azure_Policy." },
                'url': uri.replace("${scope}", scope)
            });
        });
        let responses = [];
        let responseStatusCode = 200;
        let start = 0;
        let end = (start + BATCH_MAX_SIZE) >= requests.length ? requests.length : (start + BATCH_MAX_SIZE);
        const pollInterval = 60 * 1000; // 1 min = 60 * 1000ms
        while (end <= requests.length && start < end) {
            batchWebRequest.body = JSON.stringify({ 'requests': requests.slice(start, end) });
            console.log(`Getting results for requests # ${start} to # ${end - 1}  ==>`);
            //batchWebRequest.body = JSON.stringify({ 'requests' : requests });
            //console.log('Getting batch result for requests ==>', requests.length);
            yield client_1.sendRequest(batchWebRequest).then((response) => {
                console.log('Response status code: ', response.statusCode);
                if (response.statusCode == 200) {
                    //console.log(`Received results.`);
                    if (response != null && response.body != null && response.body.responses != null) {
                        responses.push(...response.body.responses);
                    }
                }
                else if (response.statusCode == 202) {
                    resultWebRequest.uri = response.headers.location;
                    responseStatusCode = 202;
                }
                else {
                    return Promise.reject(`An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
                }
            }).catch(error => {
                return Promise.reject(error);
            });
            if (resultWebRequest.uri != null && resultWebRequest.uri != "") {
                while (responseStatusCode == 202) {
                    yield sleep(pollInterval);
                    yield client_1.sendRequest(resultWebRequest).then((response) => {
                        console.log('Response status code: ', response.statusCode);
                        if (response.statusCode == 200) {
                            //console.log(`Received results.`);
                            if (response != null && response.body != null && response.body.value != null) {
                                responses.push(...response.body.value);
                            }
                            responseStatusCode = 200;
                        }
                        else if (response.statusCode == 202) {
                            responseStatusCode = 202;
                        }
                        else {
                            return Promise.reject(`An error occured while fetching the batch result from redirect url. StatusCode: ${response.statusCode}, RedirectUrl: ${JSON.stringify(resultWebRequest.uri)}`);
                        }
                    }).catch(error => {
                        return Promise.reject(error);
                    });
                }
            }
            start = end;
            end = start + BATCH_MAX_SIZE > requests.length ? requests.length : start + BATCH_MAX_SIZE;
            resultWebRequest.uri = "";
        }
        return Promise.resolve(responses);
    });
}
exports.batchCall = batchCall;
function getScanResult(polls, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let scanResults = [];
        //Get query results for each poll.scope
        let scanResultUrl = 'https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$filter=complianceState eq \'NonCompliant\'&$apply=groupby((resourceId),aggregate($count as Count))&$select=ResourceId,Count';
        let policyEvalUrl = 'https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$expand=PolicyEvaluationDetails';
        //let policyDetailsUrl = 'https://management.azure.com/subscriptions/c00d16c7-6c1f-4c03-9be1-6934a4c49682/providers/Microsoft.Authorization/policyDefinitions/606d41f6-a0f3-416a-b0e5-a9ba5f5a904d?api-version=2019-09-01';
        //First batch call
        Utility_1.printPartitionedText('First set of batch calls::');
        let scopes = [];
        let pendingPolls = polls;
        let url = scanResultUrl;
        while (pendingPolls.length > 0) {
            yield batchCall(url, 'POST', null, pendingPolls, token).then((responseList) => {
                pendingPolls = [];
                responseList.forEach(resultsObject => {
                    if (resultsObject.httpStatusCode == 200) {
                        if (resultsObject.content["@odata.nextLink"] != null) {
                            pendingPolls.push({ 'scope': resultsObject.content["@odata.nextLink"] });
                        }
                        scopes.push(...(resultsObject.content.value.filter(result => { return result.complianceState == 'NonCompliant' && !ignoreResultHelper_1.ignoreScope(result.resourceId); })
                            .map(result => { return result.resourceId; })));
                    }
                });
                //console.log(`Scopes for next call:: ${scopes.toString()}`);
            }).catch(error => {
                throw Error(`Error in first batch call. Error :: ${error}`);
            });
            url = "${scope}";
        }
        console.log("Scopes length : " + scopes.length);
        // Getting unique scopes
        scopes = [...new Set(scopes)].map(item => { return { 'scope': item }; });
        console.log("Unique scopes length : " + scopes.length);
        Utility_1.printPartitionedText('Second set of batch calls::');
        pendingPolls = scopes;
        url = policyEvalUrl;
        while (pendingPolls.length > 0) {
            //Get policyEvaluationDetails for each resourceId in query results
            yield batchCall(url, 'POST', null, pendingPolls, token).then((responseList) => {
                pendingPolls = [];
                responseList.forEach(resultsObject => {
                    if (resultsObject.httpStatusCode == 200) {
                        if (resultsObject.content["@odata.nextLink"] != null) {
                            pendingPolls.push({ 'scope': resultsObject.content["@odata.nextLink"] });
                        }
                        scanResults.push(...(resultsObject.content.value.filter(result => { return result.complianceState == 'NonCompliant'; })
                            .map((resultJson) => {
                            let policyEvaluationDetails = {};
                            try {
                                policyEvaluationDetails = getPolicyEvaluationDetails(resultJson.policyEvaluationDetails);
                            }
                            catch (error) {
                                console.log(`An error has occured while parsing policyEvaluationDetails [${policyEvaluationDetails}]. Error: ${error}.`);
                            }
                            return {
                                'resourceId': resultJson.resourceId,
                                'policyAssignmentId': resultJson.policyAssignmentId,
                                'policyDefinitionId': resultJson.policyDefinitionId,
                                'resourceLocation': resultJson.resourceLocation,
                                'resourceType': resultJson.resourceType,
                                'complianceState': resultJson.complianceState,
                                'policyEvaluation': policyEvaluationDetails
                            };
                        })));
                    }
                });
            }).catch(error => {
                throw Error(`Error in second batch call. Error :: ${error}`);
            });
            url = "${scope}";
        }
        //Writing to file non-compliant records from every successful poll, for every poll-round
        try {
            if (scanResults.length > 0) {
                const scanReportPath = `${fileHelper.getPolicyScanDirectory()}/${exports.JSON_FILENAME}`;
                fs.appendFileSync(scanReportPath, JSON.stringify(scanResults, null, 2));
            }
        }
        catch (error) {
            throw Error(`An error has occured while recording of compliance scans to file. Error: ${error}.`);
        }
    });
}
exports.getScanResult = getScanResult;
function getConfigForTable(widths) {
    let config = {
        columns: {
            0: {
                width: widths[0],
                wrapWord: true
            },
            1: {
                width: widths[1],
                wrapWord: true
            },
            2: {
                width: widths[2],
                wrapWord: true
            },
            3: {
                width: widths[3],
                wrapWord: true
            },
            4: {
                width: widths[4],
                wrapWord: true
            },
            5: {
                width: widths[5],
                wrapWord: true
            },
            6: {
                width: widths[6],
                wrapWord: true
            },
            7: {
                width: widths[7],
                wrapWord: true
            }
        }
    };
    return config;
}
function printFormattedOutput(data) {
    let rows = [];
    let csvRows = [];
    let titles = [TITLE_RESOURCE_ID, TITLE_POLICY_ASSG_ID, TITLE_POLICY_DEF_ID, TITLE_RESOURCE_TYPE, TITLE_RESOURCE_LOCATION, TITLE_POLICY_EVAL, TITLE_COMPLIANCE_STATE];
    try {
        rows.push(titles);
        csvRows.push(titles);
        data.forEach((cve) => {
            let row = [];
            let csvRow = [];
            let policyEvaluationLogStr = JSON.stringify(cve[KEY_POLICY_EVAL], null, 2);
            while (policyEvaluationLogStr.indexOf("{") > -1 || policyEvaluationLogStr.indexOf("}") > -1 || policyEvaluationLogStr.indexOf("\\\"") > -1) {
                policyEvaluationLogStr = policyEvaluationLogStr.replace("{", "").replace("}", "").replace("\\\"", "");
            }
            let policyEvaluationCsvStr = JSON.stringify(cve[KEY_POLICY_EVAL], null, "");
            while (policyEvaluationCsvStr.indexOf(",") > -1 || policyEvaluationCsvStr.indexOf("\\n") > -1 || policyEvaluationCsvStr.indexOf("\"") > -1) {
                policyEvaluationCsvStr = policyEvaluationCsvStr.replace("},", "} || ").replace(",", " | ").replace("\"", "").replace("\\", "").replace("\\n", "");
            }
            row.push(cve[KEY_RESOURCE_ID]);
            row.push(cve[KEY_POLICY_ASSG_ID]);
            row.push(cve[KEY_POLICY_DEF_ID]);
            row.push(cve[KEY_RESOURCE_TYPE]);
            row.push(cve[KEY_RESOURCE_LOCATION]);
            row.push(policyEvaluationLogStr);
            row.push(cve[KEY_COMPLIANCE_STATE]);
            rows.push(row);
            csvRow.push(cve[KEY_RESOURCE_ID]);
            csvRow.push(cve[KEY_POLICY_ASSG_ID]);
            csvRow.push(cve[KEY_POLICY_DEF_ID]);
            csvRow.push(cve[KEY_RESOURCE_TYPE]);
            csvRow.push(cve[KEY_RESOURCE_LOCATION]);
            csvRow.push(policyEvaluationCsvStr);
            csvRow.push(cve[KEY_COMPLIANCE_STATE]);
            csvRows.push(csvRow);
        });
        let widths = [20, 20, 20, 20, 15, 45, 15];
        console.log(table.table(rows, getConfigForTable(widths)));
    }
    catch (error) {
        console.log(`An error has occured while parsing results to console output table : ${error}.`);
    }
    return csvRows;
}
exports.printFormattedOutput = printFormattedOutput;
function createCSV(data, csvName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let fileName = csvName ? csvName : exports.CSV_FILENAME;
            let filePath = fileHelper.writeToCSVFile(data, fileName);
            yield fileHelper.uploadFile(fileName, filePath, path_1.dirname(filePath));
        }
        catch (error) {
            console.log(`An error has occured while writing to csv file : ${error}.`);
        }
    });
}
exports.createCSV = createCSV;
function getScanResultForScope(scope, token) {
    return __awaiter(this, void 0, void 0, function* () {
        let selectQuery = '$select=resourceId,policyAssignmentId,resourceType,resourceLocation,complianceState';
        let expandQuery = '$expand=PolicyEvaluationDetails';
        let scanResultUrl = `https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&${expandQuery}`;
        let webRequest = new client_1.WebRequest();
        webRequest.method = 'POST';
        webRequest.uri = scanResultUrl;
        webRequest.headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
        };
        console.log('Getting scan result. URL: ', scanResultUrl);
        return client_1.sendRequest(webRequest).then((response) => {
            console.log('Response status code: ', response.statusCode);
            if (response.statusCode == 200) {
                console.log(`Received scan result for Scope: ${scope}`);
                return Promise.resolve(response.body.value);
            }
            else {
                return Promise.reject(`An error occured while fetching the scan result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
            }
        }).catch(error => {
            return Promise.reject(error);
        });
    });
}
exports.getScanResultForScope = getScanResultForScope;
