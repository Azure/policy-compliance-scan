import * as core from '@actions/core';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "./client";
import { getAADToken } from './AzCLIAADTokenGenerator';
import * as fs from 'fs';
import * as fileHelper from './fileHelper';
import * as resultScanner from './resultScanner';
import { printPartitionedText } from './Utility'
import {triggerScan, pollForCompletion} from './scanHelper'

async function getAccessToken(): Promise<string> {
  let accessToken = '';
  let expiresOn = '';
  await getAADToken().then(token => {
    const tokenObject = JSON.parse(token);
    accessToken = tokenObject.accessToken;
    expiresOn = tokenObject.expiresOn;
  });
  return accessToken;
}

export async function run() {
  try {
    const scopesInput = core.getInput('scopes');
    const token = await getAccessToken();
    const csvName = core.getInput('csv-name') + ".csv";
    const scopes = scopesInput ? scopesInput.split('\n') : [];

    let pollLocations: any[] = [];
    for (const scope of scopes) {
      const pollLocation = await triggerScan(scope, token).catch(error => {
        throw Error(error);
      });

      pollLocations.push({
        'scope' : scope,
        'pollLocation' : pollLocation 
      });
    }

    //Creating intermediate file to store success records
    const scanReportPath = `${fileHelper.getPolicyScanDirectory()}/${resultScanner.JSON_FILENAME}`;
    fs.writeFileSync(scanReportPath, "");
    //Polls and records successful non-compliant responses
    await pollForCompletion(pollLocations, token).catch(error => {
      throw Error(error);
    });

    //Fetch all successful non-compliant responses
    const out = fileHelper.getFileJson(scanReportPath);
    if(out != null && out.length > 0){

      //Console print and csv publish
      printPartitionedText('Policy compliance scan report::');
      let csv_object = resultScanner.printFormattedOutput(out);
      await resultScanner.createCSV(csv_object, csvName);

      throw Error("1 or more resources were non-compliant");
    }
    else{
      printPartitionedText('All resources are compliant');
    }
     
  } catch (error) {
    core.setFailed(error.message);
  }
}

run().catch(error => core.setFailed(error.message));