import * as core from "@actions/core";
import { printPartitionedDebugLog } from "../utils/utilities";

export function ignoreScope(scope: string): boolean {
  if (!scope) {
    return false;
  }

  const ignoreList = getIgnoreScopes();

  for (var i = 0; i < ignoreList.length; i++) {
    if (ignoreList[i].endsWith("/*")) {
      // Ignore input ends with '/*'. We need to ignore if the given scope starts with this pattern.
      let startPattern: string = ignoreList[i]
        .substr(0, ignoreList[i].length - 2)
        .toLowerCase();
      if (scope.toLowerCase().startsWith(startPattern)) {
        printPartitionedDebugLog(`Ignoring resourceId : ${scope}`);
        return true;
      }
    } else if (
      scope.toLowerCase().localeCompare(ignoreList[i].toLowerCase()) == 0
    ) {
      printPartitionedDebugLog(`Ignoring resourceId : ${scope}`);
      return true;
    }
  }
  return false;
}

function getIgnoreScopes(): string[] {
  const ignoreScopesInput = core.getInput("ignore-result");
  const ignoreScopes = ignoreScopesInput ? ignoreScopesInput.split("\n") : [];
  return ignoreScopes;
}
