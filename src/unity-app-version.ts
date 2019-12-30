// File: unity-app-version.ts                                                      //
// Project: peter.UnityHelper                                                      //
// Author: Peter Xiang                                                             //
// MIT License, Copyright (c) 2019 PeterXiang@ShadeRealm                           //
// Created Date: Thu Dec 5 2019                                                    //
// Last Modified: Mon Dec 30 2019                                                  //
// Modified By: Peter Xiang                                                        //

//help info
//https://github.com/nodeca/js-yaml/issues/100

import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as simplegit from 'simple-git/promise';

const git = simplegit();

export enum VersionUpdateMode {
    Build,
    Patch,
    Minor,
    Major
}

class Version {
    major: number = 0;
    minor: number = 0;
    patch: number = 0;
    androidBundleVersionCode: number = 0;
    buildNumberIOS: number = 0;

    constructor(version?: Version) {
        if (version) {
            this.major = version.major;
            this.minor = version.minor;
            this.patch = version.patch;
            this.androidBundleVersionCode = version.androidBundleVersionCode;
            this.buildNumberIOS = version.buildNumberIOS;
        }
    }

    ToFullVersion(): string {
        return `v${this.major}.${this.minor}.${this.patch}_${this.androidBundleVersionCode}.${this.buildNumberIOS}`;
    }

    ToBundleVersion(): string {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
}

export class UnityAppVersion {
    settingFilePath: string = "";

    constructor(arg?: any) {
    }

    async Init(): Promise<boolean> {

        let success = false;
        try {
            let workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders === undefined) {
                throw new Error(`Please open unity project`);
            }

            let workspaceFolder = workspaceFolders[0].uri.fsPath;

            this.settingFilePath = path.join(workspaceFolder, "ProjectSettings/ProjectSettings.asset");

            fs.exists(this.settingFilePath, t => {
                if (!t) {
                    throw new Error(`Not found ${this.settingFilePath}`);
                }
            });

            await this.InitGit(workspaceFolder);

            success = true;
        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }

        return success;
    }

    async InitGit(workspaceFolder: string) {
        git.cwd(workspaceFolder);
        if (!git.checkIsRepo()) {
            throw new Error(`unity project is not git repo`);
        }

        let status = await git.status();
        if (status !== undefined && !status.isClean()) {
            let result = await vscode.window.showWarningMessage("Git repo is not clean, auto commit and push?", { modal: true }, { title: "Yes", target: true }, { title: "No", target: false });
            if (result && result.target) {
                await git.add(".");
                let defaultCommitMessage: string = "Auto commit";
                let commitMessage = await vscode.window.showInputBox({ value: defaultCommitMessage, placeHolder: defaultCommitMessage, prompt: "Commit message" });
                if (commitMessage === undefined || commitMessage === "") {
                    commitMessage = defaultCommitMessage;//给默认值
                }
                await git.commit(commitMessage);//commit
                await git.push();//提交commits
                await git.pushTags();//提交tags
            } else {
                throw new Error(`git ${status.current} branch status not clean`);
            }
        }
    }

    async SelectMode(oldVersion: Version): Promise<any> {

        let result = await vscode.window.showQuickPick([
            { label: "Build", description: `Build Number <${this.UpdateVersion(oldVersion, VersionUpdateMode.Build).ToFullVersion()}>`, target: VersionUpdateMode.Build },
            { label: "Patch", description: `Patch Number <${this.UpdateVersion(oldVersion, VersionUpdateMode.Patch).ToFullVersion()}>`, target: VersionUpdateMode.Patch },
            { label: "Minor", description: `Minor Version Number <${this.UpdateVersion(oldVersion, VersionUpdateMode.Minor).ToFullVersion()}>`, target: VersionUpdateMode.Minor },
            { label: "Major", description: `Major Version Number <${this.UpdateVersion(oldVersion, VersionUpdateMode.Major).ToFullVersion()}>`, target: VersionUpdateMode.Major },
        ], { placeHolder: `Current Version ${oldVersion.ToFullVersion()}` });

        return result ? result.target : undefined;
    }

    async Apply() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Unity App Version",
            cancellable: false
        }, (progress, token) => {
            return this.Process(progress);
        });
    }

    async Process(progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
        try {
            //初始化
            progress.report({ increment: 10, message: "Initializing ..." });
            if (! await this.Init()) {
                return;
            }

            //文件 操作 ===========================================================================================

            //读取文件
            progress.report({ increment: 20, message: "Read setting file ..." });
            let settingsData = fs.readFileSync(this.settingFilePath).toString();


            /*
            //标准化yaml，移除头
            let header = "";
            for (let index = 0; index < 3; index++) {
                let pos = settingsData.search("\n");
                if (pos < 0) {
                    throw new Error(`Setting is not invaild. filepath ${this.settingFilePath}`);
                }

                header += settingsData.slice(0, pos + 1);
                settingsData = settingsData.slice(pos + 1, settingsData.length);
            }

            //加载yaml
            progress.report({ increment: 26, message: "Read yaml ..." });
            let settings = yaml.safeLoad(settingsData);
            let oldVersion = this.ReadVersion(settings);
            */
            progress.report({ increment: 26, message: "Read version ..." });
            let oldVersion = this.ReadVersion2(settingsData);
            //

            //选择更新模式
            progress.report({ increment: 30, message: "Selecting mode ..." });
            let mode = await this.SelectMode(oldVersion);
            if (mode === undefined) {
                return;
            }

            /*
            //更新配置
            progress.report({ increment: 34, message: "Update setting ..." });
            let infos = this.UpdateSettings(settings, oldVersion, mode);

            //序列化，还原移除的头
            progress.report({ increment: 40, message: "Write yaml ..." });
            settingsData = header + yaml.safeDump(settings);
            */
            progress.report({ increment: 34, message: "Update setting ..." });
            let infos = this.UpdateSettings2(settingsData, oldVersion, mode);
            //

            //写入文件
            progress.report({ increment: 50, message: "Write setting file ..." });
            fs.writeFileSync(this.settingFilePath, infos.settings);

            //git 操作 ===========================================================================================

            //添加
            progress.report({ increment: 60, message: "Git add setting file ..." });
            await git.add(this.settingFilePath).catch(e => { throw new Error(`Git Add ProjectSettings Error.\n${e}`); });

            //提交
            progress.report({ increment: 70, message: "Git commit setting file ..." });

            let commitMsg = `Update version [${oldVersion.ToFullVersion()}] to [${infos.newVersion.ToFullVersion()}] `;
            await git.commit(commitMsg).catch(e => { throw new Error(`Git Commit ProjectSettings Error.\n${e}`); });

            //标签
            progress.report({ increment: 80, message: "Git add tag ..." });
            await git.addTag(`${infos.newVersion.ToFullVersion()}`).catch(e => { throw new Error(`Git add tag Error.\n${e}`); });

            //提交
            progress.report({ increment: 90, message: "Git push ..." });
            await git.push();//提交commits
            await git.pushTags();//提交tags

            //成功
            progress.report({ increment: 100, message: "Success." });

            //输出信息
            vscode.window.showInformationMessage(`${commitMsg}`);
        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }
    }

    RegAndroidBundleVersionCode: RegExp = /AndroidBundleVersionCode: (?<AndroidBundleVersionCode>.*)/;
    RegBundleVersion: RegExp = /bundleVersion: (?<bundleVersion>.*)/;
    RegBuildNumber1: RegExp = /iOS: (?<buildNumberiOS>.*)/;
    RegBuildNumber2: RegExp = /iPhone: (?<buildNumberiPhone>.*)/;
    RegVersion: RegExp = /(?<major>\d+)\.(?<minor>\d+)(\.(?<patch>\d+))?/;

    ReadVersion2(settings: string): Version {
        let version: Version = new Version();

        let d1 = settings.match(this.RegAndroidBundleVersionCode);
        if (d1 && d1.groups) {
            version.androidBundleVersionCode = d1.groups.AndroidBundleVersionCode && Number.parseInt(d1.groups.AndroidBundleVersionCode) || 0;
        }

        let d2 = settings.match(this.RegBundleVersion);
        if (d2 && d2.groups) {
            let bundleVersion: string = d2.toString();
            let versionMatcher = bundleVersion.match(this.RegVersion);
            if (versionMatcher && versionMatcher.groups) {
                version.major = versionMatcher.groups.major && Number.parseInt(versionMatcher.groups.major) || 0;
                version.minor = versionMatcher.groups.minor && Number.parseInt(versionMatcher.groups.minor) || 0;
                version.patch = versionMatcher.groups.patch && Number.parseInt(versionMatcher.groups.patch) || 0;
            }
        }

        let d3 = settings.match(this.RegBuildNumber1);
        let d4 = settings.match(this.RegBuildNumber2);
        if (d3 && d3.groups) {
            version.buildNumberIOS = d3.groups.buildNumberiOS && Number.parseInt(d3.groups.buildNumberiOS) || 0;
        } else if (d4 && d4.groups) {
            version.buildNumberIOS = d4.groups.buildNumberiPhone && Number.parseInt(d4.groups.buildNumberiPhone) || 0;
        }

        return version;
    }


    UpdateSettings2(settings: string, oldVersion: Version, mode: VersionUpdateMode): { newVersion: Version, settings: string } {
        //更新版本
        let newVersion = this.UpdateVersion(oldVersion, mode);

        //写入需要修改的配置
        settings = settings.replace(this.RegAndroidBundleVersionCode, `AndroidBundleVersionCode: ${newVersion.androidBundleVersionCode.toString()}`);
        settings = settings.replace(this.RegBundleVersion, `bundleVersion: ${newVersion.ToBundleVersion()}`);
        settings = settings.replace(this.RegBuildNumber1, `iOS: ${newVersion.buildNumberIOS.toString()}`);
        settings = settings.replace(this.RegBuildNumber2, `iPhone: ${newVersion.buildNumberIOS.toString()}`);

        return { newVersion, settings };
    }

    ReadVersion(settings: any): Version {
        //
        let version: Version = new Version();

        //读取需要修改的配置
        version.androidBundleVersionCode = settings.PlayerSettings.AndroidBundleVersionCode as number || 0;
        version.buildNumberIOS = settings.PlayerSettings.buildNumber.iOS as number || settings.PlayerSettings.buildNumber.iPhone as number || 0;
        let bundleVersion = settings.PlayerSettings.bundleVersion;

        bundleVersion = bundleVersion !== undefined && bundleVersion.toString() || '';
        let versionMatcher = bundleVersion.match(/(?<major>\d+)\.(?<minor>\d+)(\.(?<patch>\d+))?/);
        if (versionMatcher && versionMatcher.groups) {
            version.major = versionMatcher.groups.major && Number.parseInt(versionMatcher.groups.major) || 0;
            version.minor = versionMatcher.groups.minor && Number.parseInt(versionMatcher.groups.minor) || 0;
            version.patch = versionMatcher.groups.patch && Number.parseInt(versionMatcher.groups.patch) || 0;
        }

        return version;
    }

    UpdateVersion(oldVersion: Version, mode: VersionUpdateMode): Version {

        let newVersion: Version = new Version(oldVersion);

        switch (mode) {
            case VersionUpdateMode.Build:
                newVersion.androidBundleVersionCode += 1;
                newVersion.buildNumberIOS += 1;
                break;
            case VersionUpdateMode.Patch:
                newVersion.patch += 1;
                newVersion.buildNumberIOS = 0;
                newVersion.androidBundleVersionCode += 1;
                break;
            case VersionUpdateMode.Minor:
                newVersion.minor += 1;
                newVersion.patch = 0;
                newVersion.buildNumberIOS = 0;
                newVersion.androidBundleVersionCode += 1;
                break;
            case VersionUpdateMode.Major:
                newVersion.major += 1;
                newVersion.minor = 0;
                newVersion.patch = 0;
                newVersion.buildNumberIOS = 0;
                newVersion.androidBundleVersionCode += 1;
                break;
        }

        return newVersion;
    }

    UpdateSettings(settings: any, oldVersion: Version, mode: VersionUpdateMode): { newVersion: Version } {
        //更新版本
        let newVersion = this.UpdateVersion(oldVersion, mode);

        //写入需要修改的配置
        settings.PlayerSettings.bundleVersion = newVersion.ToBundleVersion();
        settings.PlayerSettings.AndroidBundleVersionCode = newVersion.androidBundleVersionCode;

        if (settings.PlayerSettings.buildNumber.iOS !== undefined) {
            settings.PlayerSettings.buildNumber.iOS = newVersion.buildNumberIOS;
        } else if (settings.PlayerSettings.buildNumber.iPhone !== undefined) {
            settings.PlayerSettings.buildNumber.iPhone = newVersion.buildNumberIOS;
        }

        return { newVersion };
    }

}