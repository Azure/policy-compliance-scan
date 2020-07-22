import * as core from "@actions/core";
import {
  StatusCodes,
  WebRequest,
  WebResponse,
  sendRequest,
} from "../utils/httpClient";
import * as fs from "fs";
import * as fileHelper from "../utils/fileHelper";
import { ignoreScope } from "../report/ignoreResultHelper";
import {
  printPartitionedDebugLog,
  sleep,
  printPartitionedText,
} from "../utils/utilities";

const BATCH_MAX_SIZE = 500;
const BATCH_POLL_INTERVAL: number = 60 * 1000; // 1 min = 60 * 1000ms
const BATCH_POLL_TIMEOUT_DURATION: number = 120 * 60 * 1000; //5 mins

const CONDITION_MAP = {
  containsKey: "Current value must contain the target value as a key.",
  notContainsKey: "Current value must not contain the target value as a key.",
  contains: "Current value must contain the target value.",
  notContains: "Current value must not contain the target value.",
  equals: "Current value must be equal to the target value.",
  notEquals: "Current value must not be equal to the target value.",
  less:
    "Current value must be less than the target value.	less or not greaterOrEquals",
  greaterOrEquals:
    "Current value must be greater than or equal to the target value.	greaterOrEquals or not less",
  greater:
    "Current value must be greater than the target value.	greater or not lessOrEquals",
  lessOrEquals:
    "Current value must be less than or equal to the target value.	lessOrEquals or not greater",
  exists: "Current value must exist.",
  notExists: "Current value must not exist.",
  in: "Current value must be in the target value.",
  notIn: "Current value must not be in the target value.",
  like: "Current value must be like the target value.",
  notLike: "Current value must not be like the target value.",
  match: "Current value must case-sensitive match the target value.",
  notMatch: "Current value must case-sensitive not match the target value.",
  matchInsensitively:
    "Current value must case-insensitive match the target value.",
  notMatchInsensitively:
    "Current value must case-insensitive not match the target value.",
};

function getPolicyEvaluationDetails(evalData: any): any {
  if (evalData == null || evalData == {}) {
    return "No Evaluation details received";
  }
  if (
    evalData.evaluatedExpressions == null ||
    evalData.evaluatedExpressions.length == 0
  ) {
    return "No expressions evaluated";
  }
  let finalVal: string = "{ ";
  let index = 1;
  evalData.evaluatedExpressions.forEach((element) => {
    if (index > 1) finalVal = finalVal + ",";
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

export async function batchCall(
  batchUrl: string,
  batchMethod: string,
  batchRequests: any[],
  token: string
): Promise<WebResponse> {
  let batchWebRequest = new WebRequest();
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

  core.debug(
    `Batch request :: Batch URL: ${batchWebRequest.uri} # Requests: ${batchRequests.length}`
  );
  if (batchRequests.length > 0) {
    core.debug(`\tRequest URL sample: => ${batchRequests[0].url}`);
  }
  return await sendRequest(batchWebRequest)
    .then((response: WebResponse) => {
      if (response.statusCode == 200 || response.statusCode == 202) {
        core.debug(
          `Batch response :: Status: ${response.statusCode} Location: ${response.headers["location"]} Body: ${response.body}`
        );
        return Promise.resolve(response);
      }
      return Promise.reject(
        `An error occured while fetching the batch result. StatusCode: ${
          response.statusCode
        }, Body: ${JSON.stringify(response.body)}`
      );
    })
    .catch((error) => {
      return Promise.reject(error);
    });
}

async function processCreatedResponses(
  receivedResponses: any[],
  token: string
): Promise<any> {
  let finalResponses: any = [];
  let responseNextPage: any = [];
  let pendingRequests: any = [];

  let values;
  try {
    if (receivedResponses && receivedResponses.length > 0) {
      receivedResponses = await Promise.all(
        receivedResponses.map(async (pendingResponse: any) => {
          //Way to do async forEach
          values = [];
          if (
            pendingResponse.statusCode == 200 &&
            pendingResponse != null &&
            pendingResponse.body != null
          ) {
            values = pendingResponse.body.responses
              ? pendingResponse.body.responses
              : pendingResponse.body.value;
            let nextPageLink = pendingResponse.body.nextLink
              ? pendingResponse.body.nextLink
              : null;
            if (nextPageLink != null) {
              pendingRequests.push({ url: nextPageLink });
            }
            printPartitionedDebugLog(
              `Saving ${values.length} completed responses.`
            );
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
        })
      );
    }
  } catch (error) {
    return Promise.reject(`Error in getting batch response pages. ${error}`);
  } finally {
    let resultObj = {
      finalResponses: finalResponses,
      pendingRequests: pendingRequests,
      responseNextPage: responseNextPage,
    };
    return resultObj;
  }
}

async function pollPendingResponses(
  pendingResponses: any[],
  token: string,
  sleepInterval: number
): Promise<any[]> {
  try {
    let url;
    if (pendingResponses && pendingResponses.length > 0) {
      core.debug(`Polling requests # ${pendingResponses.length}  ==>`);
      await sleep(sleepInterval); // Delay before next poll
      pendingResponses = await Promise.all(
        pendingResponses.map(async (pendingResponse: any) => {
          url =
            pendingResponse.headers && pendingResponse.headers.location
              ? pendingResponse.headers.location
              : pendingResponse.url;
          return await batchCall(url, "GET", [], token).then((response) => {
            if (response.statusCode == 200) {
              //Will be saved in next iteration
              return response;
            }
            if (response.statusCode == 202) {
              //Will be polled in next iteration
              return pendingResponse;
            }
          });
        })
      );
    }
  } catch (error) {
    return Promise.reject(`${error}`);
  } finally {
    return pendingResponses;
  }
}

export async function computeBatchCalls(
  uri: string,
  method: string,
  commonHeaders: any,
  polls: any[],
  token: string
): Promise<any[]> {
  let pendingPolls = polls;
  let requests: any = [];
  let requestNum = 0;
  let finalResponses: any = [];
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

    let batchResponses: any = [];
    let pendingResponses: any = [];
    let completedResponses: any = [];

    //Sending batch calls for all records in pendingPolls in batches of BATCH_MAX_SIZE
    let start = 0;
    let end =
      start + BATCH_MAX_SIZE >= requests.length
        ? requests.length
        : start + BATCH_MAX_SIZE;
    try {
      while (end <= requests.length && start < end) {
        core.debug(
          `Getting results for requests # ${start} to # ${end - 1}  ==>`
        );
        await batchCall("", "", requests.slice(start, end), token).then(
          (response) => {
            batchResponses.push(response);
          }
        );
        start = end;
        end =
          start + BATCH_MAX_SIZE > requests.length
            ? requests.length
            : start + BATCH_MAX_SIZE;
      }
    } catch (error) {
      return Promise.reject(`Error in fetching.  ${error}`);
    }

    //Evaluating all batch responses
    let hasPollTimedout: boolean = false;
    let pollTimeoutId = setTimeout(() => {
      hasPollTimedout = true;
    }, BATCH_POLL_TIMEOUT_DURATION);

    pendingResponses = batchResponses.filter((response) => {
      return response.statusCode == 202;
    });
    completedResponses.push(
      ...batchResponses.filter((response) => {
        return response.statusCode == 200;
      })
    );

    try {
      //Run until all batch-responses are CREATED
      while (
        pendingResponses &&
        pendingResponses.length > 0 &&
        !hasPollTimedout
      ) {
        //Polling remaining batch-responses with status = ACCEPTED
        await pollPendingResponses(
          pendingResponses,
          token,
          BATCH_POLL_INTERVAL
        ).then((polledResponses) => {
          pendingResponses = polledResponses.filter((response) => {
            return response.statusCode == 202;
          });
          completedResponses.push(
            ...polledResponses.filter((response) => {
              return response.statusCode == 200;
            })
          );
        });
        console.debug(
          `Status :: Pending ${pendingResponses.length} responses. | Completed ${completedResponses.length} responses.`
        );
        if (
          hasPollTimedout &&
          pendingResponses &&
          pendingResponses.length > 0
        ) {
          console.log("Polling responses timed-out.");
          console.log(`Pending responses : ${pendingResponses.length}`);
          break;
        }
      }
    } catch (error) {
      return Promise.reject(`Error in polling. ${error}`);
    } finally {
      if (!hasPollTimedout) {
        clearTimeout(pollTimeoutId);
      }
    }
    pendingResponses = [];
    //Getting results
    try {
      await processCreatedResponses(completedResponses, token).then(
        (intermediateResult) => {
          finalResponses.push(...intermediateResult.finalResponses);
          pendingResponses.push(...intermediateResult.pendingRequests);
          pendingPolls.push(...intermediateResult.responseNextPage); //For getting paginated responses
        }
      );

      while (
        pendingResponses &&
        pendingResponses.length > 0 &&
        !hasPollTimedout
      ) {
        //Getting batch responses nextPage
        completedResponses = [];
        await pollPendingResponses(pendingResponses, token, 0).then(
          (polledResponses) => {
            pendingResponses = polledResponses.filter((response) => {
              return response.statusCode == 202;
            }); //SHOULD BE ZERO HERE
            completedResponses.push(
              ...polledResponses.filter((response) => {
                return response.statusCode == 200;
              })
            );
          }
        );
        console.debug(
          `Status :: Pending ${pendingResponses.length} responses. | Completed ${completedResponses.length} responses.`
        );
        pendingResponses = [];
        await processCreatedResponses(completedResponses, token).then(
          (intermediateResult) => {
            finalResponses.push(...intermediateResult.finalResponses);
            pendingResponses.push(...intermediateResult.pendingRequests);
            pendingPolls.push(...intermediateResult.responseNextPage);
          }
        );
      }
    } catch (error) {
      return Promise.reject(`Error in saving results after poll. ${error}`);
    } finally {
      if (!hasPollTimedout) {
        clearTimeout(pollTimeoutId);
      }
    }

    uri = "${scope}";
    requests = [];
    requestNum = 0;
    core.debug(`# of paginated calls: ${pendingPolls.length}`);
  }

  core.debug(
    `Getting batch calls final responses # :: ${finalResponses.length}`
  );
  return Promise.resolve(finalResponses);
}

export async function saveScanResult(polls: any[], token: string) {
  let scanResults: any[] = [];
  let scopes: any = [];
  let resourceIds: string[] = [];

  //Get query results for each poll.scope
  let scanResultUrl =
    "https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$filter=complianceState eq 'NonCompliant'&$apply=groupby((resourceId),aggregate($count as Count))&$select=ResourceId,Count";
  let policyEvalUrl =
    "https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$expand=PolicyEvaluationDetails";

  //First batch call
  printPartitionedDebugLog(
    "First set of batch calls - Fetching list of unique non-compliant resourceIds :: "
  );
  await computeBatchCalls(scanResultUrl, "POST", null, polls, token)
    .then((responseList) => {
      responseList.forEach((resultsObject) => {
        if (resultsObject.httpStatusCode == 200) {
          resourceIds.push(
            ...resultsObject.content.value.map((result) => {
              return result.resourceId;
            })
          );
        }
      });
    })
    .catch((error) => {
      throw Error(`Error in first batch call. ${error}`);
    });

  core.debug("Scopes length : " + resourceIds.length);
  // Getting unique scopes and ignoring
  let result: boolean = true;
  let isResourceIgnored: boolean = false;
  printPartitionedText(`Ignoring resourceIds : `);
  scopes = [...new Set(resourceIds)]
    .filter((item) => {
      result = true;
      if (ignoreScope(item)) {
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

  printPartitionedDebugLog(
    "Second set of batch calls - Fetching all details of non-compliant resourceIds::"
  );
  await computeBatchCalls(policyEvalUrl, "POST", null, scopes, token)
    .then((responseList) => {
      responseList.forEach((resultsObject) => {
        if (resultsObject.httpStatusCode == 200) {
          scanResults.push(
            ...resultsObject.content.value
              .filter((result) => {
                return result.complianceState == "NonCompliant";
              })
              .map((resultJson) => {
                let policyEvaluationDetails: any = {};
                try {
                  policyEvaluationDetails = getPolicyEvaluationDetails(
                    resultJson.policyEvaluationDetails
                  );
                } catch (error) {
                  console.error(
                    `An error has occured while parsing policyEvaluationDetails [${policyEvaluationDetails}]. Error: ${error}.`
                  );
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
              })
          );
        }
      });
    })
    .catch((error) => {
      throw Error(`Error in second batch call. ${error}`);
    });

  //Writing to file non-compliant records from every successful poll, for every poll-round
  try {
    if (scanResults.length > 0) {
      const scanReportPath = fileHelper.getScanReportPath();
      fs.appendFileSync(scanReportPath, JSON.stringify(scanResults, null, 2));
      printPartitionedDebugLog(`Saved ${scanResults.length} records to intermediate file.`);
    }
  } catch (error) {
    throw Error(
      `An error has occured while recording of compliance scans to file. Error: ${error}.`
    );
  }
}
