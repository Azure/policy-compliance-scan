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
exports.createASCAssessments = void 0;
const client_1 = require("./client");
const uuid_1 = require("uuid");
function getSubscriptionId(scope) {
    return scope.substring(1).split('/')[1];
}
function getDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        const run_id = process.env['GITHUB_RUN_ID'];
        const workflow = process.env['GITHUB_WORKFLOW'];
        const repo = process.env['GITHUB_REPOSITORY'];
        const run_url = `https://github.com/${repo}/actions/runs/${run_id}?check_suite_focus=true`;
        const workflow_url = `https://github.com/${repo}/actions?query=workflow%3A${workflow}`;
        return {
            description: `This security assessment has been created from GitHub actions workflow.
        You can find <a href="${workflow_url}">the workflow here</a>.
        This assessment was created from <a href="${run_url}">this workflow run</a>.
        For mitigation take appropriate steps.`,
            remediationSteps: "You can do it yourself",
            title: "Policy Compliance scan Assessment from github"
        };
    });
}
function getAssessmentName(details) {
    const run_id = process.env['GITHUB_RUN_ID'];
    const workflow = process.env['GITHUB_WORKFLOW'];
    return `${details.title} - ${workflow} - ${run_id}`;
}
function createAssessmentMetadata(azureSessionToken, subscriptionId, managementEndpointUrl, metadata_guid, details) {
    return new Promise((resolve, reject) => {
        console.log("Creating Metadata");
        const severity = 'Low'; // Review later
        let webRequest = new client_1.WebRequest();
        webRequest.method = 'PUT';
        webRequest.uri = `${managementEndpointUrl}/subscriptions/${subscriptionId}/providers/Microsoft.Security/assessmentMetadata/${metadata_guid}?api-version=2020-01-01`;
        webRequest.headers = {
            'Authorization': 'Bearer ' + azureSessionToken,
            'Content-Type': 'application/json; charset=utf-8'
        };
        let body = {
            "properties": {
                "displayName": getAssessmentName(details),
                "description": details.description,
                "remediationDescription": details.remediationSteps,
                "category": [
                    "Compute"
                ],
                "severity": severity,
                "userImpact": "Low",
                "implementationEffort": "Low",
                "assessmentType": "CustomerManaged"
            }
        };
        webRequest.body = JSON.stringify(body) + "}";
        //console.log(`Request uri :: ${webRequest.uri}`);
        //console.log(`Request body :: ${webRequest.body}`);
        client_1.sendRequest(webRequest).then((response) => {
            //console.log("Response: ", response);
            if (response.statusCode == 200) {
                //console.log("Successfully created assessment metadata: ", JSON.stringify(response.body,null,4).replace("{","").replace("}",""));
                resolve("Successfully created assessment metadata.");
            }
            else {
                reject("Metadata creation failed");
            }
        }).catch(reject);
    });
}
function createAssessment(azureSessionToken, scope, subId, managementEndpointUrl, metadata_guid, details) {
    return new Promise((resolve, reject) => {
        var webRequest = new client_1.WebRequest();
        webRequest.method = 'PUT';
        webRequest.uri = `${managementEndpointUrl}${scope}/providers/Microsoft.Security/assessments/${metadata_guid}?api-version=2020-01-01`;
        webRequest.headers = {
            'Authorization': 'Bearer ' + azureSessionToken,
            'Content-Type': 'application/json; charset=utf-8'
        };
        webRequest.body = JSON.stringify({
            "properties": {
                "resourceDetails": {
                    "id": `${managementEndpointUrl}${scope}`,
                    "source": "Azure"
                },
                "status": {
                    "cause": "Created Using a GitHub action",
                    "code": "Unhealthy",
                    "description": details.description
                }
            }
        });
        // console.log(`Request uri :: ${webRequest.uri}`);
        // console.log(`Request body :: ${webRequest.body}`);
        client_1.sendRequest(webRequest).then((response) => {
            // console.log("Response", response);
            if (response.statusCode == 200) {
                resolve('Successfully created Assessment');
            }
            else {
                reject('Assessment creation failed');
            }
        }).catch(reject);
    });
}
function createASCAssessment(azureSessionToken, scope) {
    return __awaiter(this, void 0, void 0, function* () {
        let metadata_guid = uuid_1.v4();
        const details = yield getDetails();
        const subscriptionId = getSubscriptionId(scope);
        const managementEndpointUrl = "https://management.azure.com/";
        //console.log("------------------------");
        //console.log(`Creating ASC Assessment for => SubscriptionId: ${subscriptionId} || ResourceId: ${scope}`);
        //console.log("------------------------");
        yield createAssessmentMetadata(azureSessionToken, subscriptionId, managementEndpointUrl, metadata_guid, details);
        yield createAssessment(azureSessionToken, scope, subscriptionId, managementEndpointUrl, metadata_guid, details);
        //console.log("------------------------");
        //console.log("Creating ASC Assessment Completed");
        //console.log("------------------------");
    });
}
function createASCAssessments(azureSessionToken, scopes) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const scope of scopes) {
            yield createASCAssessment(azureSessionToken, scope.scope);
        }
    });
}
exports.createASCAssessments = createASCAssessments;
