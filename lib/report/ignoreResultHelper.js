"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ignoreScope = void 0;
const core = __importStar(require("@actions/core"));
function ignoreScope(scope) {
    if (!scope) {
        return false;
    }
    const ignoreList = getIgnoreScopes();
    for (var i = 0; i < ignoreList.length; i++) {
        // If the given scope starts with any of the ignore scopes then we return true
        if (scope.startsWith(ignoreList[i].toLocaleLowerCase())) {
            return true;
        }
    }
    return false;
}
exports.ignoreScope = ignoreScope;
function getIgnoreScopes() {
    const ignoreScopesInput = core.getInput('ignore-result');
    const ignoreScopes = ignoreScopesInput ? ignoreScopesInput.split('\n') : [];
    return ignoreScopes;
}
