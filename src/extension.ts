// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AddUnityScript, AddArg } from "./add-unity-script";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext)
{

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "unityhelper" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let addunityscript = vscode.commands.registerCommand('extension.addunityscript', (arg?: any) =>
	{
		let adder = new AddUnityScript(arg);
		if (adder.isvalid) { adder.Apply(); }
	});
	
	let resetunityscripttemplate = vscode.commands.registerCommand('extension.resetunityscripttemplate', (arg?: any) =>
	{
		let adder = new AddUnityScript(arg);
		if (adder.isvalid) { adder.initOrGetTemplatPath(true); }
	});

	context.subscriptions.push(addunityscript);
	context.subscriptions.push(resetunityscripttemplate);
}

// this method is called when your extension is deactivated
export function deactivate() { }
