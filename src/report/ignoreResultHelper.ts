import * as core from "@actions/core";

export function ignoreScope(scope: string): boolean {
  if (!scope) {
    return false;
  }

  const ignoreList: string[] = getIgnoreScopes();

  for (const ignoreScope of ignoreList) {
    if (ignoreScope.endsWith("/*")) {
      // Ignore input ends with '/*'. We need to ignore if the given scope starts with this pattern.
      let startPattern: string = ignoreScope
        .substr(0, ignoreScope.length - 2)
        .toLowerCase();
      if (scope.toLowerCase().startsWith(startPattern)) {
        return true;
      }
    } else if (scope.toLowerCase() == ignoreScope.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function getIgnoreScopes(): string[] {
  const ignoreScopesInput = core.getInput("scopes-ignore");
  const ignoreScopes = ignoreScopesInput ? ignoreScopesInput.split("\n") : [];
  return ignoreScopes;
}
