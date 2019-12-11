// File: unity-project-update.ts                                                   //
// Project: peter.UnityHelper                                                      //
// Author: Peter Xiang                                                             //
// MIT License, Copyright (c) 2019 PeterXiang@ShadeRealm                           //
// Created Date: Tue Dec 10 2019                                                   //
// Last Modified: Wed Dec 11 2019                                                  //
// Modified By: Peter Xiang                                                        //


import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as xml from "xml-js";

interface AsmDef {
    guid: string;
    name: string;
}
interface AsmRef {
    guid: string;
}

class AsmData {
    name: string = "";
    guid: string = "";
    dir: string = "";
    files: string[] = [];

    constructor(guid: string) {
        this.guid = guid;
    }
}

class BuildData {

    defaultAssmblyName: string = "Assembly-CSharp";
    defaultEditorAssmblyName: string = "Assembly-CSharp-Editor";

    files: string[] = [];
    editorFiles: string[] = [];

    assemblyGuids: { [key: string]: AsmData; } = {};

    constructor() {
    }

    GetAsm(guid: string): AsmData {
        let result: AsmData = this.assemblyGuids[guid];
        if (result === undefined) {
            result = new AsmData(guid);
            this.assemblyGuids[guid] = result;
        }

        return result;
    }

    PushFiles(guid: string, files: string[]) {
        if (guid === "") {//默认
            for (const file of files) {
                let matcher = file.match(/.*[\\\/]assets[\\\/](.*[\\\/])?editor[\\\/].*/i);
                if (matcher === null) {//非编辑器文件
                    this.files.push(file);
                } else {//编辑器文件
                    this.editorFiles.push(file);
                }
            }
            return;
        }

        let asm = this.GetAsm(guid);
        for (const file of files) {
            asm.files.push(file);
        }
    }

    AddAsmDef(asmDef: AsmDef, dir: string): AsmData {
        let data = this.GetAsm(asmDef.guid);
        data.name = asmDef.name;
        data.dir = dir;
        return data;
    }

    AddAsmRef(asmRef: AsmRef, dir: string): AsmData {
        let data = this.GetAsm(asmRef.guid);
        return data;
    }
}

export class UnityProjectUpdate {

    projectRoot: string = "";
    assetsRoot: string = "";

    constructor(arg?: any) {

    }

    async Apply() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Unity Project Update",
            cancellable: false
        }, (progress, token) => {
            return this.Process(progress);
        });
    }

    async Process(progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>) {
        try {

            //初始化
            await this.Init();

            //构建资源
            let buildData = await this.BuildAssets();

            //整理资源
            let projData = await this.LoadProjectFiles(buildData);

            //更新配置
            await this.UpdateProjectsFiles(projData);

            //输出信息
            vscode.window.showInformationMessage(`Unity Update Project Success.`);
        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
            console.log(error);
        }
    }


    GetProjectRelativePath(fullPath: string): string {
        let relativePath = path.relative(this.projectRoot, fullPath);
        return relativePath;
    }

    async UpdateProjectsFiles(projData: { [key: string]: string[]; }): Promise<void> {
        for (const key in projData) {
            if (!projData.hasOwnProperty(key)) {
                continue;
            }

            const files = projData[key];
            await this.UpdateProjectFiles(key, files);
        }
    }

    async UpdateProjectFiles(settingPath: string, files: string[]) {
        let settingData = fs.readFileSync(settingPath, "utf-8");
        let settingXml = xml.xml2js(settingData);

        let projectRoot = (settingXml.elements as xml.Element[]).find((e) => e.name === 'Project');
        if (projectRoot === undefined || projectRoot.elements === undefined) {
            throw new Error(`Setting file not exist <Project> element:${settingPath}`);
        }

        let added: boolean = false;

        for (let elem of projectRoot.elements as xml.Element[]) {
            if (elem.name !== "ItemGroup") {
                continue;
            }

            let newElems: xml.Element[] = [];

            if (!added) {//只添加一次
                added = true;
                //添加
                for (const file of files) {
                    //相对路径
                    let relPath = this.GetProjectRelativePath(file);

                    //创建节点
                    let subElem: xml.Element = {
                        name: "Compile",
                        attributes: { Include: relPath },
                        type: "element",
                    };

                    //添加节点
                    newElems.push(subElem);
                }
            }

            //添加需要的节点

            for (let subElem of elem.elements as xml.Element[]) {
                if (subElem.name === "Compile") {
                    continue;
                }

                newElems.push(subElem);
            }

            elem.elements = newElems;
        }

        settingData = xml.js2xml(settingXml, { spaces: 2 });
        fs.writeFileSync(settingPath, settingData);
    }

    GetProjectFilePath(assmblyName: string): string {
        let fullPath = path.join(this.projectRoot, `${assmblyName}.csproj`);
        return fullPath;
    }

    LoadProjectFiles(buildData: BuildData): { [key: string]: string[]; } {
        let projectFiles: { [key: string]: string[]; } = {};

        let defaultProjPath = this.GetProjectFilePath(buildData.defaultAssmblyName);
        if (buildData.files.length > 0) {
            if (!fs.existsSync(defaultProjPath)) {
                throw new Error(`Not found project file:${defaultProjPath}`);
            }

            projectFiles[defaultProjPath] = buildData.files;
        }

        let defaultEditorProjPath = this.GetProjectFilePath(buildData.defaultEditorAssmblyName);
        if (buildData.editorFiles.length > 0) {
            if (!fs.existsSync(defaultProjPath)) {
                throw new Error(`Not found project file:${defaultEditorProjPath}`);
            }

            projectFiles[defaultEditorProjPath] = buildData.editorFiles;
        }

        for (const key in buildData.assemblyGuids) {
            if (!buildData.assemblyGuids.hasOwnProperty(key)) {
                continue;
            }

            const asmData = buildData.assemblyGuids[key];

            let projPath = this.GetProjectFilePath(asmData.name);

            projectFiles[projPath] = asmData.files;
        }

        return projectFiles;
    }

    async BuildAssets(): Promise<BuildData> {
        let result: BuildData = new BuildData();
        await this.BuildPath(this.assetsRoot, result);
        return result;
    }

    async BuildPath(dir: string, data: BuildData, guid: string = ""): Promise<void> {
        let files = fs.readdirSync(dir);//获取目录信息
        if (files === undefined) {
            return;
        }

        let subfiles: string[] = [];//文件集合
        let subDirs: string[] = [];//子目录集合
        let asmDef: AsmDef | undefined = undefined;//模块定义文件
        let asmRef: AsmRef | undefined = undefined;//模块定义引用文件

        for (let file of files) {//遍历目录文件
            let fullPath: string = path.join(dir, file);//全路径
            let state = fs.statSync(fullPath);//文件信息

            if (state.isDirectory()) {//目录
                subDirs.push(fullPath);
            } else if (state.isFile()) {//文件
                let extName = path.extname(fullPath).toLowerCase();//获取后缀
                switch (extName) {
                    case ".cs":
                        subfiles.push(fullPath);
                        break;
                    case ".asmdef":
                        if (asmDef !== undefined) {//不允许同时存在多个
                            throw new Error(`Multiple assmbly definition files were found:${dir}`);
                        }
                        asmDef = this.ReadAsmDef(fullPath);
                        break;
                    case ".asmref":
                        if (asmRef !== undefined) {//不允许同时存在多个
                            throw new Error(`Multiple assmbly definition files were found:${dir}`);
                        }
                        asmRef = this.ReadAsmRef(fullPath);
                        break;
                }
            }
        }

        if (asmDef !== undefined && asmRef !== undefined) {//不允许同时存在
            throw new Error(`Multiple assmbly definition files were found:${dir}`);
        }

        let asmData: AsmData | undefined = undefined;
        if (asmDef !== undefined) {//添加程序集
            asmData = data.AddAsmDef(asmDef, dir);
        } else if (asmRef !== undefined) {//添加引用程序集
            asmData = data.AddAsmRef(asmRef, dir);
        }

        if (asmData !== undefined) {
            guid = asmData.guid;//更换程序集
        }

        //添加到目标程序集
        data.PushFiles(guid, subfiles);

        //遍历子目录
        for (let subDir of subDirs) {
            await this.BuildPath(subDir, data, guid);
        }
    }

    ReadAsmDef(fullPath: string): AsmDef {
        let result: AsmDef = { guid: "", name: "" };

        let metaFullPath = fullPath + ".meta";

        if (!fs.existsSync(metaFullPath)) {
            throw new Error(`Target file not exist:${metaFullPath}`);
        }

        let metaData = fs.readFileSync(metaFullPath, "utf-8");
        let asmDefData = fs.readFileSync(fullPath, "utf-8").trim();

        let metaYaml = yaml.safeLoad(metaData);
        let asmDefJson = JSON.parse(asmDefData);
        result.guid = metaYaml.guid;
        result.name = asmDefJson.name;

        return result;
    }

    ReadAsmRef(fullPath: string): AsmRef {
        let result: AsmRef = { guid: "" };

        let asmRefData = fs.readFileSync(fullPath, "utf-8").trim();
        let asmRefJson = JSON.parse(asmRefData);

        let reference: string = asmRefJson.reference;
        result.guid = reference.split(":")[1].trim();

        return result;
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
    }
}