import * as core from '@actions/core';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "./client";
import { getAADToken } from './AzCLIAADTokenGenerator';
import * as fs from 'fs';
import * as fileHelper from './fileHelper';
import * as table from 'table';
import {dirname} from 'path'
import { ignoreScope } from './ignoreResultHelper'
import { printPartitionedText, sleep } from './Utility'

const KEY_RESOURCE_ID = "resourceId";
const KEY_POLICY_ASSG_ID = "policyAssignmentId";
const KEY_POLICY_DEF_ID = "policyDefinitionId"
const KEY_RESOURCE_TYPE = "resourceType";
const KEY_RESOURCE_LOCATION = "resourceLocation";
const KEY_COMPLIANCE_STATE = "complianceState";
const KEY_POLICY_EVAL = "policyEvaluation"
const TITLE_RESOURCE_ID = "RESOURCE_ID";
const TITLE_POLICY_ASSG_ID = "POLICY_ASSG_ID";
const TITLE_POLICY_DEF_ID = "POLICY_DEF_ID";
const TITLE_RESOURCE_TYPE = "RESOURCE_TYPE";
const TITLE_RESOURCE_LOCATION = "RESOURCE_LOCATION";
const TITLE_COMPLIANCE_STATE = "COMPLIANCE_STATE";
const TITLE_POLICY_EVAL = "POLICY_EVALUATION";
const BATCH_MAX_SIZE = 500;

export const CSV_FILENAME = 'ScanReport.csv';
export const JSON_FILENAME = 'scanReport.json';

const CONDITION_MAP = { 
  'containsKey' : 'Current value must contain the target value as a key.'	 ,
  'notContainsKey' : 'Current value must not contain the target value as a key.',
  'contains' : 'Current value must contain the target value.',
  'notContains' : 'Current value must not contain the target value.',
  'equals' : 'Current value must be equal to the target value.',
  'notEquals' : 'Current value must not be equal to the target value.',
  'less' : 'Current value must be less than the target value.	less or not greaterOrEquals',
  'greaterOrEquals' : 'Current value must be greater than or equal to the target value.	greaterOrEquals or not less',
  'greater' : 'Current value must be greater than the target value.	greater or not lessOrEquals',
  'lessOrEquals' : 'Current value must be less than or equal to the target value.	lessOrEquals or not greater',
  'exists' : 'Current value must exist.',
  'notExists' : 'Current value must not exist.',
  'in' :  'Current value must be in the target value.',
  'notIn' :  'Current value must not be in the target value.',
  'like' : 'Current value must be like the target value.',
  'notLike' : 'Current value must not be like the target value.',
  'match' : 'Current value must case-sensitive match the target value.',
  'notMatch' : 'Current value must case-sensitive not match the target value.',
  'matchInsensitively' : 'Current value must case-insensitive match the target value.',
  'notMatchInsensitively' : 'Current value must case-insensitive not match the target value.'
}

function getPolicyEvaluationDetails(evalData : any) : any{
  if(evalData == null || evalData == {}){
    return "No Evaluation details received";
  }
  if(evalData.evaluatedExpressions == null || evalData.evaluatedExpressions.length == 0){
    return "No expressions evaluated";
  }
  let finalVal : string = '{ ';
  let index = 1;
  evalData.evaluatedExpressions.forEach(element => {
      if(index > 1) finalVal = finalVal + ',';
      finalVal = finalVal + '\"'+ element.path + '\" : ' + JSON.stringify({
          'REASON' : (CONDITION_MAP[element.operator.toString().toLowerCase()] ? CONDITION_MAP[element.operator.toString().toLowerCase()] : 'Not Parsed'),
          'CurrentValue' : element.expressionValue,
          'Condition' : element.operator,
          'ExpectedValue' : JSON.stringify(element.targetValue).replace("[","(").replace("]",")")
       });
      index++;
  });
  finalVal = finalVal + ' }';
  while(finalVal.indexOf('[') > -1 || finalVal.indexOf(']') > -1){
    finalVal = finalVal.replace("[","(").replace("]",")");
  }
  //core.debug(`\nPolicyEvaluationDetails parsed: ${finalVal}`);
  return JSON.parse(finalVal);
}

 export async function batchCall(batchUrl: string, batchMethod: string, batchRequests: any[], token: string): Promise<WebResponse> {
  let batchWebRequest = new WebRequest();
  batchWebRequest.method = batchMethod.length > 0 ? batchMethod :'POST';
  batchWebRequest.uri = batchUrl.length > 0 ? batchUrl : `https://management.azure.com/batch?api-version=2020-06-01` ;
  batchWebRequest.headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8'
  }
  batchWebRequest.body = batchRequests.length > 0 ? JSON.stringify({ 'requests' : batchRequests }) : ""; 

  core.debug(`Batch request :: Batch URL: ${batchWebRequest.uri} # Requests: ${batchRequests.length}`);
  if(batchRequests.length > 0){
    core.debug(`\tRequest URL sample: => ${batchRequests[0].url}`);
  }
  return await sendRequest(batchWebRequest).then((response: WebResponse) => {
    if (response.statusCode == 200 || response.statusCode == 202){
      core.debug(`Batch response :: Status: ${response.statusCode} Location: ${response.headers['location']} Body: ${response.body}`);
      return Promise.resolve( response );
    }
    return Promise.reject(`An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
  }).catch(error => {
    return Promise.reject(error);
  });
 }

  export async function batchCalls(uri: string, method: string ,commonHeaders: any, polls: any[], token: string): Promise<any[]> {    

    let pendingPolls = polls;
    let requests : any = [];
    let requestNum = 0;
    let responses : any = [];
    //For response pagination ($skipToken calls)
    while(pendingPolls.length > 0){

      pendingPolls.forEach(poll => {
        let scope = poll.scope;
        requests.push({
          'content': null,
          'httpMethod': method,
          'name': requestNum++,
          'requestHeaderDetails': { "commandName": "Microsoft_Azure_Policy."},
          'url' : uri.replace("${scope}",scope)
        });
      });

      let batchResponses : any = [];
      let pendingResponses : any = [];
      let start = 0;
      let end = (start + BATCH_MAX_SIZE) >= requests.length ? requests.length : (start + BATCH_MAX_SIZE);
      //Sending batch calls for all records in pendingPolls in batches of BATCH_MAX_SIZE 
      try{
        while(end <= requests.length && start < end){   
          
          core.debug(`Getting results for requests # ${start} to # ${end - 1}  ==>`);
          await batchCall("","",requests.slice(start,end),token).then(response => {
            batchResponses.push(response);
          });
          start = end;
          end = start + BATCH_MAX_SIZE > requests.length ? requests.length : start + BATCH_MAX_SIZE; 
        }
      }
      catch(error){
        return Promise.reject(`Error in fetching.  ${error}`);
      }
      
      //Evaluating all batch responses
      pendingPolls = [];
      let hasPollTimedout: boolean = false;
      const pollTimeoutDuration: number = 5  * 60 * 1000;  //5 mins
      let pollTimeoutId = setTimeout(() => { hasPollTimedout = true; }, pollTimeoutDuration);
      const pollInterval: number = 60 * 1000; // 1 min = 60 * 1000ms
      pendingResponses.push(...batchResponses);
      let responseString : string;
      
      try{
        let isSleepRequired : boolean = false;
        //Run until all responses are CREATED
        while(pendingResponses.length > 0 && !hasPollTimedout){
          //Saving CREATED responses 
          pendingResponses = pendingResponses.map((pendingResponse: any) => {
            if (pendingResponse.statusCode == 200){
              if(pendingResponse != null && pendingResponse.body != null){
                let values = pendingResponse.body.responses ? pendingResponse.body.responses : pendingResponse.body.value;
                core.debug(`Saving ${values.length} scopes to result.`)
                values.forEach(response => {
                  responses.push(response); //Saving to final response array
                  //Will be called in next set of batch calls to get the paginated responses
                  if(response.content["@odata.nextLink"] != null){   
                    pendingPolls.push({'scope' : response.content["@odata.nextLink"]  });
                  }
                });
              }
              return null;
            }
            else if(pendingResponse.statusCode == StatusCodes.ACCEPTED){ 
              return pendingResponse;
            }
          }).filter((pendingResponse) => { return pendingResponse != null });
          isSleepRequired = false;
          if(pendingResponses.length > 0){
            //Polling remaining batches (Status = ACCEPTED)
            core.debug(`Polling requests # ${pendingResponses.length}  ==>`);
            
            pendingResponses = await Promise.all(pendingResponses.map(async (pendingResponse: any) => {
              return await batchCall(pendingResponse.headers.location,'GET', [] ,token).then(response => {
                if (response.statusCode == 200){ //Will be saved in next iteration
                  return response;
                }
                if (response.statusCode == 202){ //Will be polled in next iteration
                  isSleepRequired = true;
                  return pendingResponse;
                }
              });
            })); 
          }
          if (!hasPollTimedout && pendingResponses.length > 0 && isSleepRequired) {
            core.debug(` --------------- # of batches pending: ${pendingResponses.length}`);
            await sleep(pollInterval);
          }
          if (hasPollTimedout && pendingResponses.length > 0) {
            throw Error('Polling status timed-out.');
          }
        }
      }
      catch(error){
        return Promise.reject(`Error in polling. ${error}`);
      } 
      finally {
        if (!hasPollTimedout) {
          clearTimeout(pollTimeoutId);
        }
      }    
      uri = "${scope}";
      requests = [];
      requestNum = 0;
      core.debug(`# of paginated calls: ${pendingPolls.length}`);
    }

    core.debug(`Getting batch calls final responses # :: ${responses.length}`);
    return Promise.resolve(responses);
  }

  export async function getScanResult(polls: any[], token: string) {
    let scanResults : any[] = [];
    let scopes : any = [];
    let resourceIds : string[] = [];
  
    //Get query results for each poll.scope
    let scanResultUrl = 'https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$filter=complianceState eq \'NonCompliant\'&$apply=groupby((resourceId),aggregate($count as Count))&$select=ResourceId,Count';
    let policyEvalUrl = 'https://management.azure.com${scope}/providers/Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01&$expand=PolicyEvaluationDetails';
    
    //First batch call
    printPartitionedText('First set of batch calls::');
    await batchCalls(scanResultUrl,'POST', null, polls, token).then((responseList) => { 
      responseList.forEach(resultsObject => {
        if(resultsObject.httpStatusCode == 200){
          resourceIds.push(...(resultsObject.content.value
          .map( result => {return result.resourceId})));
        }  
      });
    }).catch(error => {
      throw Error(`Error in first batch call. ${error}`);
    });
    
    core.debug("Scopes length : " + resourceIds.length); 
    // Getting unique scopes
    scopes = [...new Set(resourceIds)].filter((item) => {return !ignoreScope(item)})
      .map(item => {return {'scope' : item }});

    core.debug("Unique scopes length : " + scopes.length); 

    printPartitionedText('Second set of batch calls::');
    await batchCalls(policyEvalUrl,'POST', null, scopes, token).then((responseList) => {   
      responseList.forEach(resultsObject => {
        if(resultsObject.httpStatusCode == 200){

          scanResults.push(...(resultsObject.content.value.filter(result =>{return result.complianceState == 'NonCompliant'})
          .map((resultJson) => {
              
            let policyEvaluationDetails : any = {};
            try{
            policyEvaluationDetails = getPolicyEvaluationDetails(resultJson.policyEvaluationDetails);
            }
            catch (error) {
              console.error(`An error has occured while parsing policyEvaluationDetails [${policyEvaluationDetails}]. Error: ${error}.`);
            }
            return {
              'resourceId' : resultJson.resourceId,
              'policyAssignmentId' : resultJson.policyAssignmentId,
              'policyDefinitionId' : resultJson.policyDefinitionId,
              'resourceLocation' : resultJson.resourceLocation,
              'resourceType' : resultJson.resourceType,
              'complianceState' : resultJson.complianceState,
              'policyEvaluation' : policyEvaluationDetails
            }
          })));
        }
      });
    }).catch(error => {
      throw Error(`Error in second batch call. ${error}`);
    });
    
    //Writing to file non-compliant records from every successful poll, for every poll-round
    try {
      if(scanResults.length > 0){
        const scanReportPath = `${fileHelper.getPolicyScanDirectory()}/${JSON_FILENAME}`;
        fs.appendFileSync(scanReportPath, JSON.stringify(scanResults, null, 2));
      }
    }
    catch (error) {
      throw Error(`An error has occured while recording of compliance scans to file. Error: ${error}.`);
    }
  }
  
  function getConfigForTable(widths: number[]): any {
    let config = {
      columns: {
        0: {
          width: widths[0],
          wrapWord: true
        },
        1: {
          width: widths[1],
          wrapWord: true
        },
        2: {
          width: widths[2],
          wrapWord: true
        },
        3: {
          width: widths[3],
          wrapWord: true
        },
        4: {
          width: widths[4],
          wrapWord: true
        },
        5: {
          width: widths[5],
          wrapWord: true
        },
        6: {
          width: widths[6],
          wrapWord: true
        },
        7: {
          width: widths[7],
          wrapWord: true
        } 
      }
    };
  
    return config;
  }
  
  export function printFormattedOutput(data : any[]): any[] {
    const skipArtifacts = core.getInput('skip-artifacts') == 'true' ? true : false;
    const maxLogRecords = Number.parseInt(core.getInput('max-log-records'));
    let rows : any = [];
    let csvRows : any = [];
    let titles = [TITLE_RESOURCE_ID, TITLE_POLICY_ASSG_ID, TITLE_POLICY_DEF_ID, TITLE_RESOURCE_TYPE, TITLE_RESOURCE_LOCATION, TITLE_POLICY_EVAL, TITLE_COMPLIANCE_STATE];
    let logRows = 0;
    try{ 
      rows.push(titles);
      csvRows.push(titles);
       
      data.forEach((cve: any) => {
          let row : any = [];
          let csvRow : any = [];
          if(logRows < maxLogRecords){
            let policyEvaluationLogStr = JSON.stringify(cve[KEY_POLICY_EVAL],null,2);
            while(policyEvaluationLogStr.indexOf("{") > -1 || policyEvaluationLogStr.indexOf("}") > -1 || policyEvaluationLogStr.indexOf("\\\"") > -1){
              policyEvaluationLogStr = policyEvaluationLogStr.replace("{","").replace("}","").replace("\\\"","");
            }
            row.push(cve[KEY_RESOURCE_ID]);
            row.push(cve[KEY_POLICY_ASSG_ID]);
            row.push(cve[KEY_POLICY_DEF_ID]);
            row.push(cve[KEY_RESOURCE_TYPE]);
            row.push(cve[KEY_RESOURCE_LOCATION]);
            row.push(policyEvaluationLogStr);
            row.push(cve[KEY_COMPLIANCE_STATE]);
            rows.push(row);
            logRows++;
          }

          if(!skipArtifacts){
            let policyEvaluationCsvStr = JSON.stringify(cve[KEY_POLICY_EVAL],null,"");
            while(policyEvaluationCsvStr.indexOf(",") > -1 || policyEvaluationCsvStr.indexOf("\\n") > -1 || policyEvaluationCsvStr.indexOf("\"") > -1 ){
              policyEvaluationCsvStr = policyEvaluationCsvStr.replace("},","} || ").replace(","," | ").replace("\"","").replace("\\","").replace("\\n","");
            }
            csvRow.push(cve[KEY_RESOURCE_ID]);
            csvRow.push(cve[KEY_POLICY_ASSG_ID]);
            csvRow.push(cve[KEY_POLICY_DEF_ID]);
            csvRow.push(cve[KEY_RESOURCE_TYPE]);
            csvRow.push(cve[KEY_RESOURCE_LOCATION]);
            csvRow.push(policyEvaluationCsvStr);
            csvRow.push(cve[KEY_COMPLIANCE_STATE]);
            csvRows.push(csvRow);
          }
      });
  
      let widths = [20, 20, 20, 20, 15, 45, 15];
      console.log(table.table(rows, getConfigForTable(widths)));  
    }
    catch (error) {
      console.error(`An error has occured while parsing results to console output table : ${error}.`);
    }
    return csvRows;
  }

export async function createCSV(data : any[], csvName: string){
    try{
      let fileName = csvName ? csvName : CSV_FILENAME;
      let filePath = fileHelper.writeToCSVFile(data, fileName);
      await fileHelper.uploadFile(
        fileName,
        filePath,
        dirname(filePath)
      );
    }
    catch (error) {
      console.error(`An error has occured while writing to csv file : ${error}.`);
    }
  
  }