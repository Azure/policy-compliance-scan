import { countReset } from "console";
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
