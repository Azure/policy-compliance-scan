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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const fileHelper = __importStar(require("./fileHelper"));
const resultScanner = __importStar(require("./resultScanner"));
const Utility_1 = require("./Utility");
const scanHelper_1 = require("./scanHelper");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            //Trigger on-demand policy scan
            let pollLocations = [];
            yield scanHelper_1.triggerOnDemandScan().then(locations => pollLocations = locations);
            //Temp-file path to store successful results.
            const scanReportPath = fileHelper.getScanReportPath();
            //Polls and records successful non-compliant responses
            yield scanHelper_1.pollForCompletion(pollLocations).catch(error => {
                throw Error(error);
            });
            //Fetch all successful non-compliant responses
            const nonCompliantResources = fileHelper.getFileJson(scanReportPath);
            if (nonCompliantResources != null && nonCompliantResources.length > 0) {
                //Console print and csv publish
                Utility_1.printPartitionedText('Policy compliance scan report::');
                let csv_object = resultScanner.printFormattedOutput(nonCompliantResources);
                const skipArtifacts = core.getInput('skip-artifacts') == 'true' ? true : false;
                if (!skipArtifacts) {
                    const csvName = core.getInput('csv-name') + ".csv";
                    yield fileHelper.createCSV(csv_object, csvName);
                }
                throw Error("1 or more resources were non-compliant");
            }
            else {
                Utility_1.printPartitionedText('All resources are compliant');
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
exports.run = run;
run().catch(error => core.setFailed(error.message));
