import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from "@actions/io";

export class AzCli {

    public static async getManagementUrl(): Promise<string> {
        if (!this._baseUrl) {
            try {
                let azCloudDetails = JSON.parse(await this.executeCommand('cloud show'));
                const cloudEndpoints = azCloudDetails['endpoints'];
                this._baseUrl = this.getResourceManagerUrl(cloudEndpoints);
            }
            catch (error) {
                console.log('Failed to get management URL from azure. Setting it to default url for public cloud.');
                this._baseUrl = this.defaultManagementUrl;
            }
        }

        return this._baseUrl;
    }

    public static async getAccessToken(): Promise<string> {
        const resource = await this.getManagementUrl();
        let accessToken = "";

        try {
            let azAccessToken = JSON.parse(await this.executeCommand("account get-access-token --resource=" + resource));
            core.setSecret(azAccessToken);
            accessToken = azAccessToken['accessToken'];
        }
        catch (error) {
            console.log('Failed to fetch Azure access token');
            throw error;
        }

        return accessToken;
    }

    public static async executeCommand(command: string, args?: string[]): Promise<string> {
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
        catch (error) {
            throw new Error(stderr);
        }

        return stdout;
    }

    private static getResourceManagerUrl(cloudEndpoints: { [key: string]: string }): string {
        if (!cloudEndpoints['resourceManager']) {
            return this.defaultManagementUrl;
        }

        // Remove trailing slash.
        return cloudEndpoints['resourceManager'].replace(/\/$/, "");
    }

    private static _baseUrl: string;
    private static defaultManagementUrl: string = "https://management.azure.com";
}