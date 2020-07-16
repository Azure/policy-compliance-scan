import * as core from '@actions/core';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "../utils/httpClient";
import * as resultScanner from './evaluationHelper';
import { printPartitionedText, printPartitionedDebugLog } from '../utils/utilities'
import { getAccessToken } from '../auth/azAuthentication'

export interface ScanCompletionPoll {
  scope: string;
  location: string;
}

export async function triggerOnDemandScan(): Promise<ScanCompletionPoll[]> {
  const token = await getAccessToken();
  const scopesInput = core.getInput('scopes');
  const scopes = scopesInput ? scopesInput.split('\n') : [];

  let polls: ScanCompletionPoll[] = [];
  for (const scope of scopes) {
    const pollLocation = await triggerScan(scope, token);
    polls.push({
      'scope': scope,
      'location': pollLocation
    });
  }
  return polls;
}

async function triggerScan(scope: string, token: string): Promise<string> {
  let triggerScanUrl = `https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01`;

  let webRequest = new WebRequest();
  webRequest.method = 'POST';
  webRequest.uri = triggerScanUrl;
  webRequest.headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8'
  }

  printPartitionedText(`Triggering scan. URL: ${triggerScanUrl}`);
  return sendRequest(webRequest).then((response: WebResponse) => {
    if (response.headers['location']) {
      let pollLocation = response.headers['location'];
      console.log(`Scan triggered successfully.\nPoll URL: ${pollLocation}`);
      return Promise.resolve(pollLocation);
    } else {
      return Promise.reject(`Location header missing in response.\nResponse body: ${JSON.stringify(response.body)}`);
    }
  }).catch(error => {
    console.log('An error occured while triggering the scan. Error: ', error);
    return Promise.reject(error);
  });
}

async function isScanCompleted(pollUrl: string, token: string): Promise<boolean> {
  let webRequest = new WebRequest();
  webRequest.method = 'GET';
  webRequest.uri = pollUrl;
  webRequest.headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8'
  }

  return sendRequest(webRequest).then((response: WebResponse) => {
    if (response.statusCode == StatusCodes.OK) {
      return Promise.resolve(true);
    } else if (response.statusCode == StatusCodes.ACCEPTED) {
      return Promise.resolve(false);
    } else {
      return Promise.reject(`An error occured while polling the scan status. Poll url: ${pollUrl}, StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
    }
  }).catch(error => {
    console.log(error);
    return Promise.reject(error);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function pollForCompletion(polls: ScanCompletionPoll[]) {
  printPartitionedText('Starting to poll for scan statuses. Polling details:');
  const token = await getAccessToken();
  polls.forEach(poll => {
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
        const isCompleted = await isScanCompleted(poll.location, token);
        if (isCompleted) {
          completedPolls.push(poll);
        }
        else {
          pendingPollsNew.push(poll);
        }
      }

      pendingPolls = pendingPollsNew;

      let startTime: Date = new Date();
      let endTime: Date = new Date();
      if (completedPolls.length > 0) {
        printPartitionedDebugLog(`Results saving ...`);
        await resultScanner.saveScanResult(completedPolls, token);
        endTime = new Date();
        printPartitionedDebugLog(`Results saved. Time taken in ms:: ${endTime.getTime() - startTime.getTime()}`);
      }
      let remainingTime = pollInterval - (endTime.getTime() - startTime.getTime());
      //If time remains after storing success results then wait for it till the pollinterval is over
      if (remainingTime > 0 && pendingPolls.length > 0) {
        await sleep(remainingTime);
      }
    }
  }
  catch (error) {
    console.log(`An error has occured while polling the status of compliance scans. \nError: ${error}.\nPending polls:`);
    pendingPolls.forEach(pendingPoll => {
      console.log(pendingPoll);
    });
    throw Error(error);
  }
}