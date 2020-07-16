import * as core from '@actions/core';
import * as fileHelper from './fileHelper';
import * as resultScanner from './resultScanner';
import { printPartitionedText } from './Utility'
import { pollForCompletion, triggerOnDemandScan } from './scanHelper'

export async function run() {
  try {

    //Trigger on-demand policy scan
    let pollLocations: any[] = [];
    await triggerOnDemandScan().then(locations => pollLocations = locations);

    //Get intermediate file path to store success records
    const scanReportPath = fileHelper.getScanReportPath();

    //Polls and records successful non-compliant responses
    await pollForCompletion(pollLocations).catch(error => {
      throw Error(error);
    });

    //Fetch all successful non-compliant responses
    const nonCompliantResources = fileHelper.getFileJson(scanReportPath);

    if (nonCompliantResources != null && nonCompliantResources.length > 0) {
      //Console print and csv publish
      printPartitionedText('Policy compliance scan report::');
      let csv_object = resultScanner.printFormattedOutput(nonCompliantResources);
      
      const skipArtifacts = core.getInput('skip-artifacts') == 'true' ? true : false;
      if (!skipArtifacts) {
        const csvName = core.getInput('csv-name') + ".csv";
        await resultScanner.createCSV(csv_object, csvName);
      }
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