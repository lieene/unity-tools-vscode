// File: add-unity-script.ts                                                       //
// Project: lieene.UnityHelper                                                     //
// Author: Lieene Guo                                                              //
// MIT License, Copyright (c) 2019 Lieene@ShadeRealm                               //
// Created Date: Mon Dec 2 2019                                                    //
// Last Modified: Tue Feb 18 2020                                                  //
// Modified By: Lieene Guo                                                         //

import * as vscode from "vscode";
//import * as yaml from "js-yaml";
import * as xml from "xml-js";
import * as fs from "fs";
import * as Path from "path";
import { promisify, isString } from "util";


export function AddArg(folder: string, isEditor: boolean, template?: string, ...factoryParams: any[])
{
  if (factoryParams && factoryParams.length === 0) { factoryParams = undefined as any; }
  return { folder, isEditor, template, factoryParams };
}
const exists = promisify(fs.exists);
const readdir = promisify(fs.readdir);
//const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export class UnityProjectLocator
{
  path: string;
  folder: string;
  isvalid: boolean;
  unityProjectRoot: string = '';
  unityAssetRoot: string = '';

  constructor(arg?: any)
  {
    if (arg)
    {
      this.path = Path.normalize(arg.fsPath);
      if (!fs.lstatSync(this.path).isDirectory())
      { this.folder = Path.dirname(this.path); }
      else { this.folder = this.path; }
      this.isvalid = true;
    }
    else
    {
      let editor = vscode.window.activeTextEditor;
      if (editor)
      {
        this.path = Path.normalize(editor.document.fileName);
        this.folder = Path.dirname(this.path);
        this.isvalid = true;
      }
      else 
      {
        this.path = this.folder = undefined as any;
        this.isvalid = false;
      }
    }


    let ws;
    if (this.folder)
    { ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.folder)); }
    else
    {
      let wss = vscode.workspace.workspaceFolders;
      if (wss) { ws = wss[0]; }
    }

    if (!ws) 
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("workspace is not located");
      return;
    }
    else { this.isvalid = true; }

    this.unityProjectRoot = Path.normalize(ws.uri.fsPath);
    this.unityAssetRoot = `${this.unityProjectRoot}\\Assets`;

    if (!fs.existsSync(`${this.unityProjectRoot}\\ProjectSettings\\ProjectVersion.txt`) ||
      !fs.existsSync(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("workspace is not a valid unity project");
      return;
    }

  }
}
export class AddUnityScript extends UnityProjectLocator
{
  isRename: boolean = false;
  basename?: string;
  isEditor: boolean = false;
  template?: string;
  factoryParams?: any[];

  //csProjectPath: string = '';
  templatePath: string = '';

  constructor(arg?: any)
  {
    super(arg);
    if (!this.folder.startsWith(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("target folder is not part of unity assets");
      return;
    }

    this.templatePath = `${this.unityAssetRoot}\\ScriptTemplates`;
    this.isEditor = Path.relative(this.unityAssetRoot, this.folder).indexOf('\\Editor') >= 0;
  }

  async Apply()
  {
    if (this.isRename) { await (this.RenameFile()); }
    else
    {
      this.GetCSprojectName(this.folder)
        .then(async s =>
        {
          if (this.isvalid) 
          {
            return await this.prepareFileContent()
              .then(add => this.writeFiles(...add)
                .then(path => this.editCSProject(s, ...path)
                  .then(rst => rst)));
          }
          else { throw new Error(`invalid add for some reason`); }
        }).then(toOpen =>
        {
          vscode.workspace.openTextDocument(toOpen).then((textDocument) =>
          {
            if (!textDocument) { return; }
            vscode.window.showTextDocument(textDocument).then((editor) =>
            {
              if (!editor) { return; }
            });
          });
        }).catch(e => vscode.window.showWarningMessage(e.toString()));
    }
  }

  async RenameFile(): Promise<void>
  {
    let op: vscode.InputBoxOptions = {} as any;
    let renameFrom = this.path;
    op.value = renameFrom;
    op.valueSelection = [renameFrom.lastIndexOf('\\') + 1, renameFrom.lastIndexOf('.')];
    op.prompt = "rename file to";
    op.ignoreFocusOut = true;
    await vscode.window.showInputBox(op).then(renameTo =>
    {
      if (renameTo)
      {
        renameTo = Path.normalize(renameTo);
        if (renameTo !== renameFrom)
        {
          // let fromBaseName = Path.basename(renameFrom);
          // let fromFolder = Path.dirname(renameFrom);
          let toBaseName = Path.basename(renameTo);
          let renamingFolder = fs.lstatSync(this.folder).isDirectory();
          let toFolder = renamingFolder ? renameTo : Path.dirname(renameTo);
          if (toFolder.startsWith(this.unityAssetRoot))
          {
            if (toBaseName.endsWith('.cs'))
            {
              if (fs.existsSync(renameTo))
              { vscode.window.showWarningMessage(`file already exist at: ${renameTo}`); }
              else
              {
                fs.renameSync(renameFrom, renameTo);
                vscode.window.showInformationMessage(`File renamed: ${renameFrom} =>  ${renameTo}`);
                if (this.isvalid)
                { this.GetCSprojectName(toFolder).then(async csProjPath => { this.editCSProject(csProjPath, [renameFrom, renameTo!]); }); }
              }
            }
            else if (renamingFolder)
            {
              if (fs.existsSync(renameTo))
              { vscode.window.showWarningMessage(`file already exist at: ${renameTo}`); }
              else
              {
                fs.renameSync(renameFrom, renameTo);
                vscode.window.showInformationMessage(`File renamed: ${renameFrom} =>  ${renameTo}`);
                if (this.isvalid)
                {
                  this.GetCSprojectName(toFolder).then(async csProjPath =>
                  {
                    let xmlSrc = (await readFile(csProjPath)).toString();
                    let fromRelPath = Path.normalize(Path.relative(this.unityProjectRoot, renameFrom));
                    let toRelPath = Path.normalize(Path.relative(this.unityProjectRoot, renameTo!));
                    let fromPtn: RegExp = new RegExp(fromRelPath.replace(/\\/g, "[\\\\/]+"), 'ig');
                    xmlSrc = xmlSrc.replace(fromPtn, toRelPath);
                    fs.writeFileSync(csProjPath, xmlSrc);
                    vscode.window.showInformationMessage(`Fils in ${csProjPath} moved from ${toRelPath} to ${toRelPath}`);
                  });
                }
              }
            }
          }
        }
      }
    });

  }

  async GetCSprojectName(path: string): Promise<string>
  {
    if (path.endsWith(".asmdef"))
    {
      return exists(path).then(x =>
      {
        if (x) { return this.retriveCsprojectPathFromJSON(path); }
        else { return this.retriveCsprojectPathFromJSON(); } //get default csproject name
      });
    }
    else
    {
      if (this.unityProjectRoot.startsWith(path)) { return this.retriveCsprojectPathFromJSON(); }
      else if (fs.lstatSync(path).isDirectory())
      {
        return readdir(path).then(files =>
        {
          for (let len = files.length, i = 0; i < len; i++)
          {
            let fn = files[i];
            if (fn.endsWith(".asmdef"))
            { return this.retriveCsprojectPathFromJSON(`${path}\\${fn}`); }
          }
          return this.GetCSprojectName(Path.dirname(path));
        });
      }
      else { return this.GetCSprojectName(Path.dirname(path)); }
    }
  }

  async retriveCsprojectPathFromJSON(jsonPath?: string): Promise<string>
  {
    if (jsonPath)
    {
      try
      {
        let doc = JSON.parse((await readFile(jsonPath)).toString().trim());
        if (doc.name) { return `${this.unityProjectRoot}\\${doc.name}.csproj`; }
      }
      catch (e) { vscode.window.showWarningMessage(`invalid asmdef file found at ${jsonPath} \n using default unity csprojects...`); }
    }

    if (this.isEditor) { return `${this.unityProjectRoot}\\Assembly-CSharp-Editor.csproj`; }
    else { return `${this.unityProjectRoot}\\Assembly-CSharp.csproj`; }
  }

  async writeFiles(...filses: [string, any][]): Promise<string[]>
  {
    let out: string[] = [];
    for (let i = 0, len = filses.length; i < len; i++)
    {
      let file = filses[i];
      let path = file[0];
      if (fs.existsSync(path))
      { vscode.window.showWarningMessage(`file already exist at: ${path}`); }
      else
      {
        try
        {
          fs.writeFileSync(path, file[1].toString());
          if (path.endsWith('.cs')) { out.push(path); }
        }
        catch (e) { console.log(e); }
      }
    }
    return out;
  }

  async editCSProject(csProjectPath: string, ...addOrChangeItems: (string | [string, string])[]): Promise<string>
  {
    let xmlSrc = (await readFile(csProjectPath)).toString();
    for (let i = 0, len = addOrChangeItems.length; i < len; i++)
    {
      let item = addOrChangeItems[i];
      if (isString(item))
      {
        let addRelPath = Path.normalize(Path.relative(this.unityProjectRoot, item));
        let patten = new RegExp(addRelPath.replace(/\\/g, "[\\\\/]+"), 'g');
        if (xmlSrc.match(patten)) { addOrChangeItems[i] = undefined as any; }
      }
      else
      {
        let fromRelPath = Path.normalize(Path.relative(this.unityProjectRoot, item[0]));
        let toRelPath = Path.normalize(Path.relative(this.unityProjectRoot, item[1]));
        let patten = new RegExp(fromRelPath.replace(/\\/g, "[\\\\/]+"), 'g');
        if (xmlSrc.match(patten))
        {
          xmlSrc = xmlSrc.replace(patten, toRelPath);
          addOrChangeItems[i] = undefined as any;
        }
        else
        {
          addOrChangeItems[i] = item[1];
        }
      }
    }
    let root = xml.xml2js(xmlSrc);
    let elem = root;
    if (elem) { elem = (elem.elements as xml.Element[]).find((e) => e.name === 'Project')!; }
    if (elem) { elem = (elem.elements as xml.Element[]).find((e) => e.name === 'ItemGroup')!; }
    if (elem)
    {
      for (let i = 0, len = addOrChangeItems.length; i < len; i++)
      {
        let item: string = addOrChangeItems[i] as string;
        if (item)
        {
          let newElem: xml.Element = {} as xml.Element;
          newElem.name = "Compile";
          newElem.attributes = { Include: Path.relative(this.unityProjectRoot, item) };
          newElem.type = "element";
          (elem.elements as xml.Element[]).push(newElem);
        }
      }
      let out = xml.js2xml(root);
      fs.writeFileSync(csProjectPath, out.split('><').join('>\n<'));
      vscode.window.showInformationMessage([`Fils added to ${Path.basename(csProjectPath)}`, ...addOrChangeItems].join("\n\t"));
      return addOrChangeItems.pop() as string;
    }
    else { return `invalid csporj xml format`; }
  }
  async prepareFileContent(): Promise<[string, any][]>
  {
    let op: vscode.InputBoxOptions = {} as any;
    op.value = "newscript.cs";
    op.valueSelection = [0, 9];
    op.prompt = "new file name";
    op.ignoreFocusOut = true;
    let filename = await vscode.window.showInputBox(op);
    if (filename === undefined) { throw new Error("invalid file name"); }
    filename = Path.basename(filename);
    if (!filename.endsWith('.cs')) { filename = filename + '.cs'; }

    let templatePath = await this.initOrGetTemplatPath();
    let content = await this.loadTemplates(templatePath, this.isEditor).then(async tpls =>
    {
      let pick = await vscode.window.showQuickPick(tpls.map(t => t.split('.')[0]));
      if (pick)
      {
        pick = tpls.find(t => t.startsWith(pick!))!;
        return readFile(`${templatePath}\\${pick}`).then(c =>
        { return c.toString(); });
      }
      else { throw new Error("add file canceled"); }
    });

    try
    {
      let firstlineEnd = content.indexOf('\n');
      let rawRule: { [key: string]: string } = JSON.parse(content.slice(2, firstlineEnd));
      content = content.slice(firstlineEnd + 1);
      let params = await this.loadParameters(Path.basename(filename, ".cs"));
      for (const ptn in rawRule)
      {
        if (ptn)
        {
          let replace: string | undefined = rawRule[ptn];
          if (replace === undefined) { throw new Error("Invalid replace JSON header"); }
          if (replace.startsWith('$'))
          {
            let p = params[replace];
            if (p) { replace = p; }
            else//parameter not found
            {
              replace = await vscode.window.showInputBox({ value: ptn, prompt: replace });
              if (replace === undefined) { throw new Error("user canceled"); }
            }
          }
          else if (replace.startsWith('#'))
          {
            let relPath = Path.relative(this.unityAssetRoot, this.folder);
            let rootIdx = relPath.lastIndexOf(replace.slice(1));
            if (rootIdx < 0) { replace = replace.slice(1); }
            else { replace = relPath.slice(rootIdx).replace(/\\/g, "."); }
          }
          else
          {
            replace = await vscode.window.showInputBox({ value: ptn, prompt: replace });
            if (replace === undefined) { throw new Error("user canceled"); }
          }
          content = content.replace(RegExp(ptn, 'g'), replace);
        }
      }
    }
    catch (e) { throw new Error("Invalid placeholder script"); }

    return [[`${this.folder}\\${filename}`, content]];
  }

  async initOrGetTemplatPath(forceReset: boolean = false): Promise<string>
  {
    let templatePath = this.templatePath;
    if (!fs.existsSync(templatePath)) { fs.mkdirSync(templatePath); }

    let asmdefPath = `${templatePath}\\template.asmdef`;
    if (forceReset || !fs.existsSync(asmdefPath)) { fs.writeFileSync(asmdefPath, asmdefsrc); }

    let monotplPath = `${templatePath}\\MonoBehaviour.tpl.cs`;
    if (forceReset || !fs.existsSync(monotplPath)) { fs.writeFileSync(monotplPath, MonoBehaviourTpl); }

    let editortplPath = `${templatePath}\\Editor.tpl.editor.cs`;
    if (forceReset || !fs.existsSync(editortplPath)) { fs.writeFileSync(editortplPath, EditorTpl); }

    let sotplPath = `${templatePath}\\ScriptableObject.tpl.cs`;
    if (forceReset || !fs.existsSync(sotplPath)) { fs.writeFileSync(sotplPath, ScriptableObjectTpl); }

    let cstplPath = `${templatePath}\\CSharpClass.tpl.cs`;
    if (forceReset || !fs.existsSync(cstplPath)) { fs.writeFileSync(cstplPath, csharpClassObjectTpl); }

    return templatePath;
  }

  async loadParameters(basename: string): Promise<{ [key: string]: string }>
  {
    let templatePath = this.templatePath;
    // if (!fs.existsSync(templatePath)) { fs.mkdirSync(templatePath); }
    let paramPath = `${templatePath}\\variables.json`;
    let out: { [key: string]: string } = { $basename: basename };
    if (fs.existsSync(paramPath)) 
    {
      let params = JSON.parse(fs.readFileSync(paramPath).toString());
      for (const key in params)
      {
        let k = key.startsWith('$') ? key : '$' + key;
        if (k !== "$basename") { out[k] = params[key]; }
      }
    }
    return out;
  }

  async loadTemplates(path: string, isEditor: boolean): Promise<string[]>
  {
    return readdir(path).then(files =>
    {
      let tpls: string[] = [];
      if (isEditor)
      {
        for (let len = files.length, i = 0; i < len; i++)
        {
          let fn = files[i];
          if (fn.endsWith("tpl.editor.cs")) { tpls.push(fn); }
        }
      }
      else
      {
        for (let len = files.length, i = 0; i < len; i++)
        {
          let fn = files[i];
          if (fn.endsWith("tpl.cs")) { tpls.push(fn); }
        }
      }
      return tpls;
    });
  }
}

const asmdefsrc = `{\n\t\"name": "template",\n\t\"references": [],\n\t\"includePlatforms": [],\n\t\"excludePlatforms": [],\n\t\"allowUnsafeCode": true,\n\t\"overrideReferences": false,\n\t\"precompiledReferences": [],\n\t\"autoReferenced": false,\n\t\"defineConstraints": [],\n\t\"versionDefines": []\n\}`;

const MonoBehaviourTpl = '//{"NewMono":"$basename"}\nusing UnityEngine;\npublic class NewMono : MonoBehaviour\n{\n}';
const EditorTpl = '//{"NewMono":"Data Type Name"}\nusing UnityEngine;\nusing UnityEditor;\n[CustomEditor(typeof(NewMono))]\npublic class NewMonoEditor : Editor\n{\n}';
const ScriptableObjectTpl = '//{"NewScript":"$basename"}\nusing UnityEngine;\n\npublic class NewScript : ScriptableObject\n{\n}';
const csharpClassObjectTpl = '//{"NewClass":"$basename","NameSpace":"$MyNameSpace"}\nusing UnityEngine;\nnamespace NameSpace\n{\n  public class NewClass\n  {\n  }\n}';


// export function GetUnityProjectFolder(path: string): string | undefined
// {
//   if (fs.lstatSync(path).isDirectory())
//   {
//     path = Path.normalize(path);
//     if (!Path.isAbsolute(path))
//     {
//       vscode.workspace.getWorkspaceFolder(vscode.window.a)
//       path.
//     }
//     let seg = path.split("\\");
//   }
// }


// export function tryAddSource(directoryPath: string, sourcename: string, template?: string, ...params: any[])
// {

//   if(template)
//   {
//     if(params.length>0)
//     {}
//   }
// }

// let x = JSON.parse(`[	["NewClass", "$basename"],	["NameSpace", "namespace"]]`);
// console.log(x);

// console.log("some a and some b with somec".replace('some',"llll"));