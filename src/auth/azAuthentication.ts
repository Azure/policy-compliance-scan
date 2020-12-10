import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { ManagementUrlHelper } from "./managementUrlHelper";

var azPath: string;

export async function getAccessToken(): Promise<string> {
  let accessToken = "";
  await getAADToken().then((token) => {
    const tokenObject = JSON.parse(token);
    accessToken = tokenObject.accessToken;
  });
  return accessToken;
}

export async function getAADToken(): Promise<string> {
  azPath = await io.which("az", true);
  return await getTokenFromAzCLI(
    "account get-access-token --resource=" + await ManagementUrlHelper.getBaseUrl()
  );
}

async function getTokenFromAzCLI(command: string): Promise<string> {
  try {
    let output = "";
    let error = "";
    const options: any = {};
    options.silent = true;
    options.listeners = {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        error += data.toString();
      },
    };
    await exec.exec(`"${azPath}" ${command}`, [], options);
    if (error) {
      throw new Error(error);
    }
    return output;
  } catch (error) {
    throw new Error(error);
  }
}
