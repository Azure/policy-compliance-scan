import * as core from "@actions/core";
import {
  StatusCodes,
  WebRequest,
  WebResponse,
  sendRequest,
} from "../utils/httpClient";
import * as resultScanner from "./evaluationHelper";
import {
  printPartitionedText,
  printPartitionedDebugLog,
} from "../utils/utilities";
import { AzCli } from '../azure/azCli'

export interface ScanCompletionPoll {
  scope: string;
  location: string;
  isCompleted: boolean;
}

export async function triggerOnDemandScan(): Promise<ScanCompletionPoll[]> {
  const token = await AzCli.getAccessToken();
  const scopesInput = core.getInput('scopes');
  const scopes = scopesInput ? scopesInput.split('\n') : [];

  let polls: ScanCompletionPoll[] = [];
  for (const scope of scopes) {
    const pollLocation = await triggerScan(scope, token);
    // If pollLocation is empty, it means the scan is already completed. Polling is not required.
    polls.push({
      scope: scope,
      location: pollLocation,
      isCompleted: !pollLocation,
    });
  }
  return polls;
}

async function triggerScan(scope: string, token: string): Promise<string> {
  const managementUrl: string = await AzCli.getManagementUrl();
  let triggerScanUrl = `${managementUrl}${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01`;

  let webRequest = new WebRequest();
  webRequest.method = "POST";
  webRequest.uri = triggerScanUrl;
  webRequest.headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  };

  printPartitionedText(`Triggering scan. URL: ${triggerScanUrl}`);
  return sendRequest(webRequest)
    .then((response: WebResponse) => {
      if (response.statusCode == StatusCodes.OK) {
        // If scan is done, return empty poll url
        return Promise.resolve("");
      } else if (response.statusCode == StatusCodes.ACCEPTED) {
        if (response.headers["location"]) {
          let pollLocation = response.headers["location"];
          console.log(
            `Scan triggered successfully.\nPoll URL: ${pollLocation}`
          );
          return Promise.resolve(pollLocation);
        } else {
          return Promise.reject(
            `Location header missing in response.\nResponse body: ${JSON.stringify(
              response.body
            )}`
          );
        }
      } else {
        return Promise.reject(
          `Some error occured. Scope: ${scope}, StatusCode: ${
            response.statusCode
          }, Response body: ${JSON.stringify(response.body)}`
        );
      }
    })
    .catch((error) => {
      console.log("An error occured while triggering the scan. Error: ", error);
      return Promise.reject(error);
    });
}

async function isScanCompleted(
  poll: ScanCompletionPoll,
  token: string
): Promise<boolean> {
  if (poll.isCompleted) {
    return Promise.resolve(true);
  }

  const pollUrl = poll.location;
  let webRequest = new WebRequest();
  webRequest.method = "GET";
  webRequest.uri = pollUrl;
  webRequest.headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  };

  return sendRequest(webRequest)
    .then((response: WebResponse) => {
      if (response.statusCode == StatusCodes.OK) {
        return Promise.resolve(true);
      } else if (response.statusCode == StatusCodes.ACCEPTED) {
        return Promise.resolve(false);
      } else {
        return Promise.reject(
          `An error occured while polling the scan status. Poll url: ${pollUrl}, StatusCode: ${
            response.statusCode
          }, Body: ${JSON.stringify(response.body)}`
        );
      }
    })
    .catch((error) => {
      console.log(error);
      return Promise.reject(error);
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForCompletion(polls: ScanCompletionPoll[]) {
  printPartitionedText("Starting to poll for scan statuses. Polling details:");
  const token = await AzCli.getAccessToken();
  polls.forEach((poll) => {
    console.log(`scope: ${poll.scope}\nurl: ${poll.location}\n`);
  });

  let pendingPolls: ScanCompletionPoll[] = polls;

  const pollInterval: number = 60 * 1000; // 60000ms = 1min
  try {
    printPartitionedText(`Poll interval (ms):: ${pollInterval}`);
    while (pendingPolls.length > 0) {
      let pendingPollsNew: ScanCompletionPoll[] = [];
      let completedPolls: ScanCompletionPoll[] = [];
      for (const poll of pendingPolls) {
        const isCompleted = await isScanCompleted(poll, token);
        if (isCompleted) {
          completedPolls.push(poll);
        } else {
          pendingPollsNew.push(poll);
        }
      }

      pendingPolls = pendingPollsNew;

      let startTime: Date = new Date();
      let endTime: Date = new Date();
      if (completedPolls.length > 0) {
        printPartitionedDebugLog(`Results saving ...`);
        await resultScanner.saveScanResult(completedPolls, token).then(() => {
          endTime = new Date();
          printPartitionedDebugLog(
            `Results saved. Time taken in ms:: ${
              endTime.valueOf() - startTime.valueOf()
            }`
          );
        });
      }
      let remainingTime =
        pollInterval - (endTime.valueOf() - startTime.valueOf());
      //If time remains after storing success results then wait for it till the pollinterval is over
      if (remainingTime > 0 && pendingPolls.length > 0) {
        await sleep(remainingTime);
      }
    }
  } catch (error) {
    console.log(
      `An error has occured while polling the status of compliance scans. \nError: ${error}.\nPending polls:`
    );
    pendingPolls.forEach((pendingPoll) => {
      console.log(pendingPoll);
    });
    throw Error(error);
  }
}
