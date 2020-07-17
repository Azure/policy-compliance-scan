
# [README IN PROGRESS]

# GitHub Action for Azure Policy Compliance Scan

With the Azure Policy Compliance Scan action, you can now easily trigger a [on demand  scan](https://docs.microsoft.com/en-us/azure/governance/policy/how-to/get-compliance-data#on-demand-evaluation-scan) from your GitHub workflow on one or multiple resources, resource groups or subscriptions, and continue/fail the workflow based on the compliance state of resources. You can also use this Github Action to generate a report on the compliance state of scanned resources for further analysis or archiving.

New to Azure Policy? Its a Azure service that lets you enforce organizational standards and asses compliance at scale. To know more check out: [Azure Policies - Overview](https://docs.microsoft.com/en-us/azure/governance/policy/overview)

The definition of this Github Action is in [action.yml](https://github.com/Azure/policy-compliance-scan/blob/master/action.yml).

# Inputs for the Action

* `scope`: [edit]mandatory. Takes full identifier for one or more azure resources, resource groups or subscriptions. The on-demand policy compliance scan is triggered for all of these. The ID can generally be found in the properties section of the resource in Azure Portal.
* `ignore`: Optional. Defaults to null[TODO]. Takes full identifier for one or more azure resources, resource groups. If the resources are found non-compliant after the scan completion, the action fails. However, in this input you can specify resources or resource groups for which the compliance state will be ignored. The action will pass irrespective of the compliance state of these resources. In case you want the action to always pass irrespective of the compliance state of resources, you can set its value as 'all'.
* `wait`: Optional. Defaults to true. Depending on the breadth, the time taken for compliance scan can range from a few minutes to several hours. By default, the action will wait for the compliance scan to complete and succeed or fail based on the compliance state of resources. However, you can mark this input as false, in which case the action will trigger the compliance scan and succeed. The status of the triggered scan and the compliance state of resources would have to be then viewed in Azure portal. 
* `skip-report`: Optional. Defaults to false. If false, the action will upload a CSV file containing a list of resources that are non-compliant after the triggered scan is complete. The CSV file can be downloaded as an artifact from the workflow run for manual analysis. Note that the number of rows in CSV are capped at 100,000. 
* `report-name`: Optional. Defaults to abc-10July2020-1354[TODO] The filename for the CSV to be uploaded. Ignored if skip-report is set to true.

* `max-log-records`: Optional. Defaults to 250. The action prints the details of non compliant resources in the workflow log. This input sets the max number of non-compliant resources to be listed in the workflow log. 

 

# End-to-End Sample Workflows

## Dependencies on other Github Actions

* Azure Login Action: Authenticate using [Azure Login](https://github.com/Azure/login)  action. The Policy Compliance Scan action assumes that the underlying credentials have sufficient permissions to trigger azure policy compliance scan. For more details on permissions for Azure Policy checkout: [TODO]
Once login is done, the next set of Actions in the workflow can perform tasks such as triggering the compliance scan and fetching the compliance state of resources.

  
### Sample workflow to trigger a scan on a subscription 


```yaml
# File: .github/workflows/workflow.yml

on: push

jobs:
  assess-policy-compliance:    
    runs-on: ubuntu-latest
    steps:
    # Azure Login       
    - name: Login to Azure
      uses: azure/login@v1.1
      with:
        creds: ${{secrets.AZURE_CREDENTIALS}} 
    
    - name: Check for resource compliance
      uses: azure/policy-compliance-scan@v0
      with:
        resource: 
        - /subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/
        
```
The above workflow will trigger a policy compliance scan on the provided subscription, wait till the scan is complete, fetch the latest compliance state of resources and upload a CSV file containing the list of non compliant resources and the associated policy assignments. The action will fail if there are any non-compliant resources
[TODO] Add how to find subscription from ui.


### Sample workflow to trigger a scan on a resource group and ignore compliance state of an individual resource


```yaml
# File: .github/workflows/workflow.yml

on: push

jobs:
  assess-policy-compliance:    
    runs-on: ubuntu-latest
    steps:
    # Azure Login       
    - name: Login to Azure
      uses: azure/login@v1.1
      with:
        creds: ${{secrets.AZURE_CREDENTIALS}} 
    
    - name: Check for resource compliance
      uses: azure/policy-compliance-scan@v0
      with:
        resource: 
        - /subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/resourceGroups/QA               
        ignore:
        - /subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/resourceGroups/QA/providers/Microsoft.Web/sites/demoApp
        
```
The above workflow will trigger a policy compliance scan on the 'QA' resource group. After the scan is complete, it will fetch the compliance state of resources. The action will fail if there are any non-compliant resources except for 'demoApp' resource.


### Sample workflow to trigger a scan on a subscription and continue with workflow without waiting for scan completion


```yaml
# File: .github/workflows/workflow.yml

on: push

jobs:
  assess-policy-compliance:    
    runs-on: ubuntu-latest
    steps:
    # Azure Login       
    - name: Login to Azure
      uses: azure/login@v1.1
      with:
        creds: ${{secrets.AZURE_CREDENTIALS}} 
    
    - name: Check for resource compliance
      uses: azure/policy-compliance-scan@v0
      with:
        resource: 
        - /subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/
        wait: false
    - run: |
        echo 'Running scripts...'
        
```
The above workflow will trigger a policy compliance scan on the provided subscription and proceed to the next step without waiting for the compliance scan to be complete. In this case the triggering of scan is successful, then the action will be marked as passed. To see the progress/result of scan, the user has to refer the Azure Portal UI.[TODO]



## Configure credentials for Azure login action:

For credentials like Azure Service Principal add them as [secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) in the GitHub repository and then use them in the workflow.


#### Prerequisites:
  * You should have installed Azure cli on your local machine to run the command or use the cloudshell in the Azure portal. To install       Azure cli, follow [Install Azure Cli](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest). To use       cloudshell, follow [CloudShell Quickstart](https://docs.microsoft.com/en-us/azure/cloud-shell/quickstart).
  

Follow the steps to configure the secret:
  * Define a new secret under your repository settings, Add secret menu
  * Run the below Azure cli command.


[TODO] - check if addtionals permissions are required
```bash  
  
   az ad sp create-for-rbac --name "myApp" --role contributor \
                            --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group} \
                            --sdk-auth
                            
  # Replace {subscription-id}, {resource-group} with the subscription, resource group details of the WebApp
  
  # The command should output a JSON object similar to this:

  {
    "clientId": "<GUID>",
    "clientSecret": "<GUID>",
    "subscriptionId": "<GUID>",
    "tenantId": "<GUID>",
    (...)
  }
  
```
  * Paste the contents of the above [az cli](https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest) command as the value of  secret variable, for example 'AZURE_CREDENTIALS'
  * You can further scope down the Azure Credentials to the Web App using scope attribute. For example, 
  ```
   az ad sp create-for-rbac --name "myApp" --role contributor \
                            --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Web/sites/{app-name} \
                            --sdk-auth

  # Replace {subscription-id}, {resource-group}, and {app-name} with the names of your subscription, resource group, and Azure Web App.
```
  * Now in the workflow file in your branch: `.github/workflows/workflow.yml` replace the secret in Azure login action with your secret (Refer to the examples above)


# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
