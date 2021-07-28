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
        .substr(0, ignoreScope.length - 1)
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

export function ignorePolicyAssignment(policyAssignmentId: string): boolean {
  if (!policyAssignmentId) {
    return false;
  }

  const ignoreList: string[] = getIgnorePolicyAssignments();

  for (const ignorePolicyAssignment of ignoreList) {
    if (policyAssignmentId.toLowerCase() == ignorePolicyAssignment.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function getIgnorePolicyAssignments(): string[] {
  const ignorePolicyAssignmentsInput = core.getInput("policy-assignments-ignore");
  const ignorePolicyAssignments = ignorePolicyAssignmentsInput ? ignorePolicyAssignmentsInput.split("\n") : [];
  return ignorePolicyAssignments;
}
