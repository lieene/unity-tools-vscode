// File: extension.ts                                                              //
// Project: lieene.UnityHelper                                                     //
// Author: Lieene Guo                                                              //
// MIT License, Copyright (c) 2019 Lieene@ShadeRealm                               //
// Created Date: Mon Dec 2 2019                                                    //
// Last Modified: Tue Feb 18 2020                                                  //
// Modified By: Lieene Guo                                                         //


// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AddUnityScript, AddArg } from "./add-unity-script";
import { UnityAppVersion } from "./unity-app-version";
import { UnityProjectUpdate } from "./unity-project-update";
import { UnityProjectBuild } from "./unity-project-build";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "unityhelper" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let addunityscript = vscode.commands.registerCommand('extension.addunityscript', (arg?: any) => {
		let adder = new AddUnityScript(arg);
		if (adder.isvalid) { adder.Apply(); }
	});

	let renameunityscriptorfolder = vscode.commands.registerCommand('extension.renameunityscriptorfolder', (arg?: any) => {
		let renamer = new AddUnityScript(arg);
		renamer.isRename=true;
		if (renamer.isvalid) { renamer.Apply(); }
	});

	let resetunityscripttemplate = vscode.commands.registerCommand('extension.resetunityscripttemplate', (arg?: any) => {
		let adder = new AddUnityScript(arg);
		if (adder.isvalid) { adder.initOrGetTemplatPath(true); }
	});

	let unityappversion = vscode.commands.registerCommand('extension.unityappversion', (arg?: any) => {
		let adder = new UnityAppVersion(arg);
		adder.Apply();
	});

	let unityprojectupdate = vscode.commands.registerCommand('extension.unityprojectupdate', (arg?: any) => {
		let adder = new UnityProjectUpdate(arg);
		adder.Apply();
	});
	
	let unityprojectbuild = vscode.commands.registerCommand('extension.unityprojectbuild', (arg?: any) => {
		let adder = new UnityProjectBuild(arg);
		adder.Apply();
	});

	context.subscriptions.push(addunityscript);
	context.subscriptions.push(renameunityscriptorfolder);
	context.subscriptions.push(resetunityscripttemplate);
	context.subscriptions.push(unityappversion);
	context.subscriptions.push(unityprojectupdate);
	context.subscriptions.push(unityprojectbuild);
}

// this method is called when your extension is deactivated
export function deactivate() { }
