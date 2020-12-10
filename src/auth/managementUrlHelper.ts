import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from "@actions/io";

export class ManagementUrlHelper{

    public static async getBaseUrl(): Promise<string> {
        if(!this._baseUrl) {            
            let azCloudDetails = JSON.parse(await ManagementUrlHelper.executeAzCliCommand('cloud show'));
            const cloudEndpoints = azCloudDetails['endpoints'];
            this._baseUrl = ManagementUrlHelper.getResourceManagerUrl(cloudEndpoints);
        }

        return this._baseUrl;
    }
    
    public static async executeAzCliCommand(command: string, args?: string[]): Promise<string> {
        let azCliPath = await io.which('az', true);
        let stdout = '';
        let stderr = '';

        try {
            core.debug(`"${azCliPath}" ${command}`);
            await exec.exec(`"${azCliPath}" ${command}`, args, {
                silent: true, // this will prevent priniting access token to console output
                listeners: {
                    stdout: (data: Buffer) => {
                        stdout += data.toString();
                    },
                    stderr: (data: Buffer) => {
                      stderr += data.toString();
                    }
                }
            });
        }
        catch(error) {
            throw new Error(stderr);
        }
        
        return stdout;
    }

    private static getResourceManagerUrl(cloudEndpoints: {[key: string]: string}): string {
        if (!cloudEndpoints['resourceManager']) {
            return 'https://management.azure.com';
        }

        // Remove trailing slash.
        return cloudEndpoints['resourceManager'].replace(/\/$/, "");
    }

    private static _baseUrl: string;
}