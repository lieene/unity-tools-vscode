// File: unity-project-build.ts                                                    //
// Project: peter.UnityHelper                                                      //
// Author: Peter Xiang                                                             //
// MIT License, Copyright (c) 2020 PeterXiang@ShadeRealm                           //
// Created Date: Tue Jan 14 2020                                                   //
// Last Modified: Tue Jan 14 2020                                                  //
// Modified By: Peter Xiang                                                        //


// File: unity-project-build.ts                                                    //
// Project: peter.UnityHelper                                                      //
// Author: Peter Xiang                                                             //
// MIT License, Copyright (c) 2019 PeterXiang@ShadeRealm                           //
// Created Date: Tue Dec 10 2019                                                   //
// Last Modified: Tue Jan 14 2020                                                  //
// Modified By: Peter Xiang                                                        //


import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as xml from "xml-js";
import { fileURLToPath } from 'url';
import * as cp from "child_process";
import { debug } from 'util';
import { promises } from 'dns';

export enum BuildType {
    Windows,
    IOS,
    Android
}

export class UnityProjectBuild {

    projectRoot: string = "";
    assetsRoot: string = "";
    unityExe: string = "";
    buildPath: string = "";

    constructor(arg?: any) {

    }

    async Apply() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Unity Project Build",
            cancellable: false
        }, (progress, token) => {
            return this.Process(progress);
        });
    }

    async Process(progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
        try {

            //初始化
            progress.report({ increment: 20, message: "Initializing ..." });
            await this.Init();

            //TODO
            progress.report({ increment: 30, message: "Select build platform ..." });
            let buildPlatform = await this.SelectMode();
            if (buildPlatform === undefined) {
                return;
            }

            progress.report({ increment: 40, message: "Building ..." });
            let result = await this.RunCommand(buildPlatform);
            if (result !== 0) {
                throw Error(`Build error(${result})`);
            }
            //

            //完成
            progress.report({ increment: 100, message: "Success ..." });

            //输出信息
            vscode.window.showInformationMessage(`Unity Project Build Success.`);
        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
            console.log(error);
        }
    }


    GetProjectRelativePath(fullPath: string): string {
        let relativePath = path.relative(this.projectRoot, fullPath);
        return relativePath;
    }

    GetProjectFilePath(assmblyName: string): string {
        let fullPath = path.join(this.projectRoot, `${assmblyName}.csproj`);
        return fullPath;
    }

    GetBuildCmd(target: BuildType): string {
        let methodName: string = "";
        let buildPath: string;
        switch (target) {
            case BuildType.Android:
                methodName = "UnityHelper.Builder.Android";
                buildPath = path.join(this.buildPath, "Android");
                break;
            case BuildType.IOS:
                methodName = "UnityHelper.Builder.IOS";
                buildPath = path.join(this.buildPath, "IOS");
                break;
            case BuildType.Windows:
                methodName = "UnityHelper.Builder.Windows";
                buildPath = path.join(this.buildPath, "Windows");
                break;
        }

        let logPath = path.join(buildPath, "build.log");
        let buildCmd = `\"${this.unityExe}\" -quit -batchmode -executeMethod \"${methodName}\" -projectPath \"${this.projectRoot}\" -logFile \"${logPath}\" -buildPath \"${buildPath}\"`;
        return buildCmd;
    }

    async Init(): Promise<void> {
        let workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders === undefined) {
            throw new Error(`please open unity project`);
        }

        let workspaceFolder = workspaceFolders[0].uri.fsPath;

        this.projectRoot = workspaceFolder;
        this.assetsRoot = path.join(workspaceFolder, "Assets/");
        if (!fs.existsSync(this.assetsRoot)) {
            throw new Error(`Not found unity assets folder:${this.assetsRoot}`);
        }

        let unityExe = vscode.workspace.getConfiguration().get<string>("unityhelper.unityexe");
        if (unityExe === undefined || unityExe === '') {
            throw new Error(`You need to set unityhelper.unityexe`);
        }
        if (!fs.existsSync(unityExe)) {
            throw new Error(`Not found unity exe:${unityExe}`);
        }
        this.unityExe = unityExe;

        let buildPath = vscode.workspace.getConfiguration().get<string>("unityhelper.buildpath");
        if (buildPath === undefined || buildPath === '') {
            throw new Error(`You need to set unityhelper.buildpath`);
        }
        this.buildPath = buildPath;

        //check file
        let filePath = path.join(this.projectRoot, "Assets/Editor/UnityHelper.cs");
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, this.helpScript);
        }
        //
    }

    async SelectMode(): Promise<BuildType | undefined> {

        let result = await vscode.window.showQuickPick([
            { label: "Windows", description: `Windows`, target: BuildType.Windows },
            { label: "IOS", description: `IOS`, target: BuildType.IOS },
            { label: "Android", description: `Android`, target: BuildType.Android },
        ], { placeHolder: `Build Platform Select` });

        return result ? result.target : undefined;
    }

    async RunCommand(target: BuildType): Promise<number> {
        let cmd = this.GetBuildCmd(target);
        console.log("Start Build:" + cmd);
        let result = await new Promise<number>((resolve, reject) => {
            let ps = cp.exec(cmd, { cwd: this.projectRoot, env: process.env });
            ps.on('close', (code) => {
                resolve(code);
            });
        });
        console.log("End Build:" + result);
        return result;
    }

    helpScript: string = "using System;\nusing System.IO;\nusing UnityEditor;\nusing UnityEditor.Build.Reporting;\n\nnamespace UnityHelper\n{\n    public static class Builder\n    {\n        enum ExitCode\n        {\n            Succeeded = 0,\n            Unknown = 1,\n            Failed = 2,\n            Cancelled = 3,\n            Error = 4,\n        }\n\n        static string buildPath = string.Empty;\n\n        private static void Init()\n        {\n            try\n            {\n                string path = string.Empty;\n                string[] commands = System.Environment.GetCommandLineArgs();\n                for (int i = 0; i < commands.Length; i++)\n                {\n                    if (string.Compare(commands[i], \"-buildPath\", true) == 0)\n                    {\n                        path = commands[i + 1];\n                        break;\n                    }\n                }\n                if (string.IsNullOrEmpty(path))\n                {\n                    throw new Exception(\"-buildPath is invaild.\");\n                }\n\n                buildPath = path;\n            }\n            catch (Exception)\n            {\n                EditorApplication.Exit((int)ExitCode.Error);\n            }\n        }\n\n        public static string GetPath(BuildTarget target)\n        {\n            string path = string.Empty;\n\n            if (target == BuildTarget.StandaloneWindows)\n            {\n                path = Path.Combine(buildPath, $\"{PlayerSettings.productName}.exe\");\n            }\n\n            return path;\n        }\n\n        private static void Build(BuildTarget target, BuildOptions options)\n        {\n            Init();\n            string outPath = GetPath(target);\n            BuildReport report = BuildPipeline.BuildPlayer(EditorBuildSettings.scenes, outPath, target, options);\n            CompleteBuild(report, target);\n        }\n\n        private static void CompleteBuild(BuildReport report, BuildTarget standaloneWindows)\n        {\n            BuildSummary summary = report.summary;\n            ExitCode result = ExitCode.Failed;\n            switch (summary.result)\n            {\n                case BuildResult.Unknown:\n                    result = ExitCode.Unknown;\n                    break;\n                case BuildResult.Failed:\n                    result = ExitCode.Failed;\n                    break;\n                case BuildResult.Cancelled:\n                    result = ExitCode.Cancelled;\n                    break;\n                case BuildResult.Succeeded:\n                    result = ExitCode.Succeeded;\n                    break;\n            }\n\n            EditorApplication.Exit((int)result);\n        }\n\n        public static void Windows()\n        {\n            Build(BuildTarget.StandaloneWindows, BuildOptions.None);\n        }\n\n        public static void Android()\n        {\n            Build(BuildTarget.Android, BuildOptions.None);\n        }\n\n        public static void IOS()\n        {\n            Build(BuildTarget.iOS, BuildOptions.None);\n        }\n    }\n}\n";
}