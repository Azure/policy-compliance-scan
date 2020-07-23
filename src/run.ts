import * as core from "@actions/core";
import { generateSummary } from "./report/reportGenerator";
import {
  pollForCompletion,
  ScanCompletionPoll,
  triggerOnDemandScan,
} from "./azurePolicy/scanHelper";
import { printPartitionedText } from "./utils/utilities";

export async function run() {
  try {
    // Validate scope input before proceeding
    const scopesInput = core.getInput("scopes");
    if (!scopesInput) {
      core.setFailed("No scopes supplied for scanning.");
      return;
    }

    //Trigger on-demand policy scan
    let polls: ScanCompletionPoll[] = await triggerOnDemandScan();

    const waitForCompletion: boolean = core.getInput("wait")
      ? core.getInput("wait").toUpperCase() == "TRUE"
      : false;
    if (waitForCompletion) {
      //Polls and records successful non-compliant responses
      await pollForCompletion(polls);

      //Generate compliance scan summary
      await generateSummary();
    }
    else {
      printPartitionedText("To view the status of the triggered scan and the compliance state of resources please checkout the activity log of the scope in Azure portal: https://docs.microsoft.com/en-us/azure/azure-monitor/platform/activity-log.");
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run().catch((error) => core.setFailed(error.message));
