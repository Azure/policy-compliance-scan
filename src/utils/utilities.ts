import * as crypto from "crypto";
import * as core from "@actions/core";

export function printPartitionedText(text) {
  const textPartition: string =
    "----------------------------------------------------------------------------------------------------";
  console.log(`${textPartition}\n${text}\n${textPartition}`);
}
export function printPartitionedDebugLog(text) {
  const textPartition: string =
    "----------------------------------------------------------------------------------------------------";
  core.debug(`${textPartition}\n${text}\n${textPartition}`);
}
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setUpUserAgent() {
  let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
  let actionName = 'PolicyComplianceScan';
  let userAgentString = `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
  core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
}