import * as core from '@actions/core';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "./client";
import { getAADToken } from './AzCLIAADTokenGenerator';
import * as fs from 'fs';
import * as fileHelper from './fileHelper';
import * as resultScanner from './resultScanner';
import { printPartitionedText } from './Utility'
import { triggerScan, pollForCompletion, triggerOnDemandScan } from './scanHelper'

export async function run() {
  try {
    let pollLocations: any[] = [];
    await triggerOnDemandScan().then(locations => pollLocations = locations);

    //Creating intermediate file to store success records
    const scanReportPath = `${fileHelper.getPolicyScanDirectory()}/${resultScanner.JSON_FILENAME}`;
    fs.writeFileSync(scanReportPath, "");
    //Polls and records successful non-compliant responses
    await pollForCompletion(pollLocations).catch(error => {
      throw Error(error);
    });

    //Fetch all successful non-compliant responses
    const out = fileHelper.getFileJson(scanReportPath);
    if (out != null && out.length > 0) {

      //Console print and csv publish
      printPartitionedText('Policy compliance scan report::');
      let csv_object = resultScanner.printFormattedOutput(out);
      await resultScanner.createCSV(csv_object);

      throw Error("1 or more resources were non-compliant");
    }
    else {
      printPartitionedText('All resources are compliant');
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run().catch(error => core.setFailed(error.message));