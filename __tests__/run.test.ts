import { run } from '../src/run';
import * as core from '@actions/core';
import { mocked } from 'ts-jest/utils';
import * as scanHelper from '../src/azurePolicy/scanHelper'
import * as fileHelper from '../src/utils/fileHelper'
import * as client from '../src/utils/httpClient'
import { AzCli } from '../src/azure/azCli'

const coreMock = mocked(core, true);
const clientMock = mocked(client, true);
const fileHelperMock = mocked(fileHelper, true);
const scanHelperMock = mocked(scanHelper, true);
const AzCliMock = mocked(AzCli, true);

fileHelperMock.getPolicyScanDirectory = jest.fn().mockImplementation(() => { return 'test/_temp/containerscan_123'; });

test("triggerScan() - correct scope uri is triggered", async () => {
    let scopes = '/scope';
    coreMock.getInput = jest.fn().mockReturnValue(scopes);

    AzCliMock.getAccessToken = jest.fn().mockResolvedValue("token");
    clientMock.sendRequest = jest.fn().mockImplementation(() => {
        let webResponse = new client.WebResponse();
        webResponse.statusCode = client.StatusCodes.ACCEPTED;
        webResponse.headers = {
            'location': `${scopes}`
        }
        return Promise.resolve(webResponse);
    });

    AzCliMock.getManagementUrl = jest.fn().mockResolvedValue("https://management.azure.com");

    // invoke and assert 
    await expect(scanHelper.triggerOnDemandScan()).resolves.not.toThrow();


    expect(clientMock.sendRequest.mock.calls[0][0]['uri']).toEqual('https://management.azure.com/scope/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01');

});

test("triggerScan() - correct scopes uri is triggered", async () => {
    let scopes = '/subscriptions/1234\n/subscriptions/2345';
    coreMock.getInput = jest.fn().mockReturnValue(scopes);

    AzCliMock.getAccessToken = jest.fn().mockResolvedValue("token");
    clientMock.sendRequest = jest.fn().mockImplementation(() => {
        let webResponse = new client.WebResponse();
        webResponse.statusCode = client.StatusCodes.ACCEPTED;
        webResponse.headers = {
            'location': `${scopes}`
        }
        return Promise.resolve(webResponse);
    });
    AzCliMock.getManagementUrl = jest.fn().mockResolvedValue("https://management.azure.com");

    // invoke and assert 
    await expect(scanHelper.triggerOnDemandScan()).resolves.not.toThrow();


    expect(clientMock.sendRequest.mock.calls[0][0]['uri']).toEqual('https://management.azure.com/subscriptions/1234/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01');
    expect(clientMock.sendRequest.mock.calls[1][0]['uri']).toEqual('https://management.azure.com/subscriptions/2345/providers/Microsoft.PolicyInsights/policyStates/latest/triggerEvaluation?api-version=2019-10-01');

});

test("pollForCompletion() - use poll location returned by triggerScan", async () => {
    //Mock
    let scopes = '/subscriptions/1234';

    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'wait') {
            return 'true';
        }
        return scopes;
    });

    AzCliMock.getAccessToken = jest.fn().mockResolvedValue("token");

    clientMock.sendRequest = jest.fn().mockImplementation(() => {
        let webResponse = new client.WebResponse();
        webResponse.statusCode = client.StatusCodes.ACCEPTED;
        webResponse.headers = {
            'location': `${scopes}polllocation`
        }
        return Promise.resolve(webResponse);
    });

    scanHelperMock.pollForCompletion = jest.fn().mockResolvedValue('');
    fileHelperMock.getScanReportPath = jest.fn().mockReturnValue('');
    fileHelperMock.getFileJson = jest.fn().mockReturnValue(null);
    AzCliMock.getManagementUrl = jest.fn().mockResolvedValue("https://management.azure.com");

    //Invoke and assert
    await expect(run()).resolves.not.toThrow();
    expect(scanHelperMock.pollForCompletion.mock.calls).toEqual([
        [[{
            "isCompleted": false,
            "location": "/subscriptions/1234polllocation",
            "scope": "/subscriptions/1234"
        }
        ]]
    ]);
});