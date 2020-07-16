import * as core from '@actions/core';
import { printPartitionedText } from '../utils/utilities'

export function ignoreScope(scope: string): boolean {
    if (!scope) {
        return false;
    }

    const ignoreList = getIgnoreScopes();

    for (var i = 0; i < ignoreList.length; i++) {
        // If the given scope starts with any of the ignore scopes then we return true
        if (scope.startsWith(ignoreList[i].toLocaleLowerCase())) {
            printPartitionedText(`Ignoring resourceId : ${scope}`);
            return true;
        }
    }
    return false;
}

function getIgnoreScopes(): string[] {
    const ignoreScopesInput = core.getInput('ignore-result');
    const ignoreScopes = ignoreScopesInput ? ignoreScopesInput.split('\n') : [];
    return ignoreScopes;
}