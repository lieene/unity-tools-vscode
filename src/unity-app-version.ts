// File: unity-app-version.ts                                                      //
// Project: peter.UnityHelper                                                      //
// Author: Peter Xiang                                                             //
// MIT License, Copyright (c) 2019 PeterXiang@ShadeRealm                           //
// Created Date: Thu Dec 5 2019                                                    //
// Last Modified: Mon Dec 09 2019                                                  //
// Modified By: Peter Xiang                                                        //

//help info
//https://github.com/nodeca/js-yaml/issues/100

import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as simplegit from 'simple-git/promise';
import { stringify } from 'querystring';
import { SSL_OP_ALL } from 'constants';

const git = simplegit();

export enum VersionUpdateMode {
    Build,
    Revision,
    Minor,
    Major
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
                throw new Error(`please open unity project`);
            }

            let workspaceFolder = workspaceFolders[0].uri.fsPath;

            this.settingFilePath = path.join(workspaceFolder, "ProjectSettings/ProjectSettings.asset");

            fs.exists(this.settingFilePath, t => {
                if (!t) {
                    throw new Error(`not found ${this.settingFilePath}`);
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
                await git.commit("auto commit");
                await git.push();
            } else {
                throw new Error(`git ${status.current} branch status not clean`);
            }
        }
    }

    async SelectMode(): Promise<any> {

        let result = await vscode.window.showQuickPick([
            { label: 'Build', description: 'Build Number <0.0.0b[x]>', target: VersionUpdateMode.Build },
            { label: 'Patch', description: 'Patch Number <0.0.[x]b0>', target: VersionUpdateMode.Revision },
            { label: 'Minor', description: 'Minor Version Number <0.[x].0b0>', target: VersionUpdateMode.Minor },
            { label: 'Major', description: 'Major Version Number <[x].0.0b0>', target: VersionUpdateMode.Major },
        ], { placeHolder: "select mode" });

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

            //选择模式
            progress.report({ increment: 20, message: "Selecting mode ..." });
            let mode = await this.SelectMode();
            if (mode === undefined) {
                return;
            }

            //读取文件
            progress.report({ increment: 30, message: "Read setting file ..." });
            let settingsData = fs.readFileSync(this.settingFilePath).toString();

            //标准化yaml，移除头
            let header = "";
            for (let index = 0; index < 3; index++) {
                let pos = settingsData.search("\n");
                if (pos < 0) {
                    throw new Error(`Setting is not invaild.filepath ${this.settingFilePath}`);
                }

                header += settingsData.slice(0, pos + 1);
                settingsData = settingsData.slice(pos + 1, settingsData.length);
            }

            //加载yaml
            progress.report({ increment: 40, message: "Read yaml ..." });
            let settings = yaml.safeLoad(settingsData);

            //更新配置
            progress.report({ increment: 50, message: "Update setting ..." });
            let infos = this.UpdateSettings(settings, mode);

            //序列化，还原移除的头
            progress.report({ increment: 60, message: "Write yaml ..." });
            settingsData = header + yaml.safeDump(settings);

            //写入文件
            progress.report({ increment: 70, message: "Write setting file ..." });
            fs.writeFileSync(this.settingFilePath, settingsData);

            //添加
            progress.report({ increment: 80, message: "Git add setting file ..." });
            await git.add(this.settingFilePath).catch(e => { throw new Error(`Git Add ProjectSettings Error.\n${e}`); });

            //提交
            progress.report({ increment: 90, message: "Git commit setting file ..." });

            let commitMsg = `Update version [${infos.oldVersion.major}.${infos.oldVersion.minor}.${infos.oldVersion.patch} build ${infos.oldVersion.androidBundleVersionCode}.${infos.oldVersion.buildNumberIOS}] to [${infos.newVersion.major}.${infos.newVersion.minor}.${infos.newVersion.patch} build ${infos.newVersion.androidBundleVersionCode}.${infos.newVersion.buildNumberIOS}]`;
            await git.commit(commitMsg).catch(e => { throw new Error(`Git Commit ProjectSettings Error.\n${e}`); });

            //标签
            progress.report({ increment: 95, message: "Git add tag ..." });
            await git.addTag(`v${infos.newVersion.major}.${infos.newVersion.minor}.${infos.newVersion.patch}_${infos.newVersion.androidBundleVersionCode}.${infos.newVersion.buildNumberIOS}`).catch(e => { throw new Error(`Git add tag Error.\n${e}`); });

            //提交
            progress.report({ increment: 95, message: "Git push ..." });
            await git.push();

            //成功
            progress.report({ increment: 100, message: "Success." });

            //输出信息
            vscode.window.showInformationMessage(`${commitMsg}`);


        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }
    }

    UpdateSettings(settings: any, mode: number): any {
        //读取需要修改的配置
        let bundleVersion = settings.PlayerSettings.bundleVersion;
        bundleVersion = bundleVersion !== undefined && bundleVersion.toString() || '';
        let androidBundleVersionCode = settings.PlayerSettings.AndroidBundleVersionCode as number || 0;
        let buildNumberIOS = settings.PlayerSettings.buildNumber.iOS as number || 0;
        let major = 0;
        let minor = 0;
        let patch = 0;

        let versionMatcher = bundleVersion.match(/(?<major>\d+).(?<minor>\d+)(.(?<patch>\d+))?/);
        if (versionMatcher && versionMatcher.groups) {
            major = versionMatcher.groups.major && Number.parseInt(versionMatcher.groups.major) || 0;
            minor = versionMatcher.groups.minor && Number.parseInt(versionMatcher.groups.minor) || 0;
            patch = versionMatcher.groups.patch && Number.parseInt(versionMatcher.groups.patch) || 0;
        }

        let oldVersion = { major, minor, patch, androidBundleVersionCode, buildNumberIOS };

        switch (mode) {
            case VersionUpdateMode.Build:
                androidBundleVersionCode += 1;
                buildNumberIOS += 1;
                break;
            case VersionUpdateMode.Revision:
                patch += 1;
                buildNumberIOS = 0;
                androidBundleVersionCode += 1;
                break;
            case VersionUpdateMode.Minor:
                minor += 1;
                patch = 0;
                buildNumberIOS = 0;
                androidBundleVersionCode += 1;
                break;
            case VersionUpdateMode.Major:
                major += 1;
                minor = 0;
                patch = 0;
                buildNumberIOS = 0;
                androidBundleVersionCode += 1;
                break;
        }

        bundleVersion = `${major}.${minor}.${patch}`;

        //写入需要修改的配置
        settings.PlayerSettings.bundleVersion = bundleVersion;
        settings.PlayerSettings.AndroidBundleVersionCode = androidBundleVersionCode;
        settings.PlayerSettings.buildNumber.iOS = buildNumberIOS;

        let newVersion = { major, minor, patch, androidBundleVersionCode, buildNumberIOS };

        return { oldVersion, newVersion };
    }
}