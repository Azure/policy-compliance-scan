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
exports.uploadFile = exports.getFilePath = exports.writeToCSVFile = exports.getTempDirectory = exports.removePolicyScanDirectory = exports.getPolicyScanDirectory = exports.getFileJson = exports.getScanReportPath = exports.JSON_FILENAME = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const os = __importStar(require("os"));
const artifact_1 = require("@actions/artifact");
let POLICY_SCAN_DIRECTORY = '';
exports.JSON_FILENAME = 'scanreport.json';
function getScanReportPath() {
    const scanReportPath = `${getPolicyScanDirectory()}/${exports.JSON_FILENAME}`;
    //Creating intermediate file if it doesn't exist
    if (!fs.existsSync(scanReportPath)) {
        fs.writeFileSync(scanReportPath, "");
    }
    return scanReportPath;
}
exports.getScanReportPath = getScanReportPath;
function getFileJson(path) {
    let rawContent = '';
    let offset = 0;
    let start = 0;
    let end = 0;
    try {
        rawContent = fs.readFileSync(path, 'utf8');
        let savedData = [];
        if (rawContent != null && rawContent.length > 0) {
            offset = 0;
            start = rawContent.indexOf('[', offset);
            end = rawContent.indexOf(']', offset) + 1;
            while (start >= 0) {
                savedData.push(...JSON.parse(rawContent.substring(start, end)));
                offset = rawContent.indexOf(']', offset) + 1;
                start = rawContent.indexOf('[', offset);
                end = rawContent.indexOf(']', offset) + 1;
            }
        }
        return savedData;
    }
    catch (ex) {
        throw new Error(`An error occured while reading the contents of the file: ${path}. Error: ${ex}. JSON : ${rawContent.substring(start, end)}`);
    }
}
exports.getFileJson = getFileJson;
function getPolicyScanDirectory() {
    if (!POLICY_SCAN_DIRECTORY) {
        POLICY_SCAN_DIRECTORY = `${process.env['GITHUB_WORKSPACE']}/_temp/policyScan_${Date.now()}`;
        ensureDirExists(POLICY_SCAN_DIRECTORY);
    }
    return POLICY_SCAN_DIRECTORY;
}
exports.getPolicyScanDirectory = getPolicyScanDirectory;
function removePolicyScanDirectory() {
    if (POLICY_SCAN_DIRECTORY) {
        fs.rmdir(POLICY_SCAN_DIRECTORY, (error) => {
            if (error) {
                throw Error(`An error occured while deleting action temp folder. Error: ${error};`);
            }
        });
    }
}
exports.removePolicyScanDirectory = removePolicyScanDirectory;
function ensureDirExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function getTempDirectory() {
    return process.env['runner.tempDirectory'] || os.tmpdir();
}
exports.getTempDirectory = getTempDirectory;
function writeToCSVFile(inputObject, name) {
    if (inputObject) {
        try {
            const filePath = getFilePath(name);
            fs.writeFileSync(filePath, '');
            inputObject.forEach(row => {
                let rowString = JSON.stringify(row).replace("[", "").replace("]", "");
                fs.appendFileSync(filePath, rowString + '\n');
            });
            return filePath;
        }
        catch (ex) {
            throw Error('Exception occurred while writing results to csv file : ' + inputObject + ' . Exception: ' + ex);
        }
    }
    return '';
}
exports.writeToCSVFile = writeToCSVFile;
function getFilePath(name) {
    const tempDirectory = getTempDirectory();
    const filePath = path.join(tempDirectory, path.basename(name));
    return filePath;
}
exports.getFilePath = getFilePath;
function uploadFile(fileName, filePath, rootDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const artifactClient = artifact_1.create();
            const options = {
                continueOnError: false
            };
            const uploadResponse = yield artifactClient.uploadArtifact(fileName, [filePath], rootDirectory, options);
            if (uploadResponse.failedItems.length > 0) {
                core.setFailed(`An error was encountered when uploading ${uploadResponse.artifactName}. There were ${uploadResponse.failedItems.length} items that failed to upload.`);
            }
            else {
                core.info(`Artifact ${uploadResponse.artifactName} has been successfully uploaded!`);
            }
        }
        catch (err) {
            throw Error(`Error in Artifact uploading. Error : ${err}`);
        }
    });
}
exports.uploadFile = uploadFile;
