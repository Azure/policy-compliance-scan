import * as core from '@actions/core';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "./client";
import * as resultScanner from './resultScanner';
import { printPartitionedText } from './Utility'
import { getAccessToken } from './AzCLIAADTokenGenerator'

export async function triggerOnDemandScan(): Promise<any[]> {
  const token = await getAccessToken();
  const scopesInput = core.getInput('scopes');
  const scopes = scopesInput ? scopesInput.split('\n') : [];

  let pollLocations: any[] = [];
  for (const scope of scopes) {
    const pollLocation = await triggerScan(scope, token).catch(error => {
      throw Error(error);
    });

    pollLocations.push({
      'scope': scope,
      'pollLocation': pollLocation
    });
  }
  return pollLocations;
}

export async function triggerScan(scope: string, token: string): Promise<string> {
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
    //console.log('Response status code: ', response.statusCode);
    if (response.headers['location']) {
      let pollLocation = response.headers['location'];
      //console.log('Successfully triggered scan. Poll location: ', pollLocation)
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

  //console.log(`Polling for scan status. URL: ${pollUrl}`);
  return sendRequest(webRequest).then((response: WebResponse) => {
    //console.log(`Response status code: ${response.statusCode}\n`);
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

export async function pollForCompletion(pollLocations: any[]) {
  printPartitionedText('Starting to poll for scan statuses. Poll urls:');
  const token = await getAccessToken();
  pollLocations.forEach(location => {
    console.log(location.pollLocation);
  });

  let pendingPolls: any[] = pollLocations;

  let pollRound: number = 1;
  const pollInterval: number = 60 * 1000; // 60000ms = 1min
  try {
    printPartitionedText(`Poll interval (ms):: ${pollInterval}`);
    while (pendingPolls.length > 0) {
      printPartitionedText(`Poll round: ${pollRound}, No. of pending polls: ${pendingPolls.length}`);
      let pendingPollsNew: any[] = [];
      let completedPolls: any[] = [];
      for (const poll of pendingPolls) {
        const isCompleted = await isScanCompleted(poll.pollLocation, token);
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
        //printPartitionedText(`Results saving ...`);
        await resultScanner.getScanResult(completedPolls, token);
        endTime = new Date();
        //printPartitionedText(`Results saved. Time taken in ms:: ${endTime.getTime() - startTime.getTime()}`);
      }
      let remainingTime = pollInterval - (endTime.getTime() - startTime.getTime());
      //If time remains after storing success results then wait for it till the pollinterval is over
      if (remainingTime > 0 && pendingPolls.length > 0) {
        await sleep(remainingTime);
      }
      pollRound++;
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