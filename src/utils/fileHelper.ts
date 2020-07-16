import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as os from 'os';
import {create, UploadOptions} from '@actions/artifact';

export const JSON_FILENAME = 'scanreport.json';
let POLICY_SCAN_DIRECTORY = '';
export const JSON_FILENAME = 'scanReport.json';
export const CSV_FILENAME = 'ScanReport.csv';

export function getScanReportPath(): string {
    const scanReportPath = `${getPolicyScanDirectory()}/${JSON_FILENAME}`;
    //Creating intermediate file if it doesn't exist
    if(!fs.existsSync(scanReportPath)){
        fs.writeFileSync(scanReportPath, "");
    }   
    return scanReportPath;
}

export function getFileJson(path: string): any {
    let rawContent = '';
    let offset = 0;
    let start = 0;
    let end = 0;
    try {
        rawContent = fs.readFileSync(path, 'utf8');
        let savedData : any[] = [];
        if(rawContent != null && rawContent.length > 0){
            offset = 0;
            start = rawContent.indexOf('[', offset);
            end = rawContent.indexOf(']', offset) + 1;
            while(start >= 0){
                savedData.push(...JSON.parse(rawContent.substring(start,end)));
                offset = rawContent.indexOf(']', offset) + 1;
                start = rawContent.indexOf('[', offset);
                end = rawContent.indexOf(']', offset) + 1;
            }
        }
          return savedData;
    } catch (ex) {
        throw new Error(`An error occured while reading the contents of the file: ${path}. Error: ${ex}. JSON : ${rawContent.substring(start,end)}`);
    }
}

export function getPolicyScanDirectory(): string {
    if (!POLICY_SCAN_DIRECTORY) {
        POLICY_SCAN_DIRECTORY = `${process.env['GITHUB_WORKSPACE']}/_temp/policyScan_${Date.now()}`;
        ensureDirExists(POLICY_SCAN_DIRECTORY);
    }

    return POLICY_SCAN_DIRECTORY;
}

export function removePolicyScanDirectory() {
    if(POLICY_SCAN_DIRECTORY){
        fs.rmdir(POLICY_SCAN_DIRECTORY, (error) => { 
            if (error) { 
              throw Error(`An error occured while deleting action temp folder. Error: ${error};`);
            }
        });
    }
}

function ensureDirExists(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function getTempDirectory(): string {
    return process.env['runner.tempDirectory'] || os.tmpdir();
}

export function writeToCSVFile(inputObject: any[], name: string): string {
    if (inputObject) {
        try {
            const filePath = getFilePath(name);
            fs.writeFileSync(filePath,'');
            inputObject.forEach(row => {
              let rowString =  JSON.stringify(row).replace("[","").replace("]","");
              fs.appendFileSync(filePath, rowString+'\n');
            })
            return filePath;
        } catch (ex) {
            throw Error('Exception occurred while writing results to csv file : ' + inputObject + ' . Exception: ' + ex);
        }
    }
    return '';
}

export function getFilePath(name: string) {
    const tempDirectory = getTempDirectory();
    const filePath = path.join(tempDirectory, path.basename(name));
    return filePath;
}

export async function createCSV(data : any[], csvName: string){
    try{
      let fileName = csvName ? csvName : CSV_FILENAME;
      let filePath = writeToCSVFile(data, fileName);
      await uploadFile(
        fileName,
        filePath,
        path.dirname(filePath)
      );
    }
    catch (error) {
      console.error(`An error has occured while writing to csv file : ${error}.`);
    }
  
  }

export async function uploadFile(fileName: string, filePath: string, rootDirectory: string): Promise<void> {
    try {
        const artifactClient = create();
        const options: UploadOptions = {
        continueOnError: false
        };
  
        const uploadResponse = await artifactClient.uploadArtifact(
            fileName,
            [filePath],
            rootDirectory,
            options
        );
  
        if (uploadResponse.failedItems.length > 0) {
            core.setFailed(
                `An error was encountered when uploading ${uploadResponse.artifactName}. There were ${uploadResponse.failedItems.length} items that failed to upload.`
            )
        } else {
            core.info(
                `Artifact ${uploadResponse.artifactName} has been successfully uploaded!`
            )
        }
    } catch (err) {
        throw Error(`Error in Artifact uploading. Error : ${err}`);
    }
  }
