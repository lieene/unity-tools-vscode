/*
 * File: add-unity-script
 * Project: lieene.UnityHelper
 * Created Date: Mon Dec 2 2019
 * Author: Lieene Guo
 * -----
 * Last Modified: Mon Dec 02 2019
 * Modified By: Lieene Guo
 * -----
 * MIT License
 * 
 * Copyright (c) 2019 Lieene@ShadeRealm
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * -----
 * HISTORY:
 * Date      	By	Comments
 * ----------	---	----------------------------------------------------------
 */
import * as vscode from "vscode";
import * as yaml from "js-yaml";
import * as xml from "xml-js";
import * as fs from "fs";
import * as Path from "path";
import { promisify } from "util";

export function AddArg(folder: string, isEditor: boolean, template?: string, ...factoryParams: any[])
{
  if (factoryParams && factoryParams.length === 0) { factoryParams = undefined as any; }
  return { folder, isEditor, template, factoryParams };
}
const exists = promisify(fs.exists);
const readdir = promisify(fs.readdir);
//const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export class AddUnityScript
{
  folder: string;
  basename?: string;
  isEditor: boolean = false;
  template?: string;
  factoryParams?: any[];
  isvalid: boolean;

  unityPorjectRoot: string = '';
  unityAssetRoot: string = '';
  csProjectPath: string = '';

  constructor(arg?: any)
  {
    if (arg)
    {
      this.folder = Path.normalize(arg.fsPath);
      this.isvalid = true;
    }
    else
    {
      let editor = vscode.window.activeTextEditor;
      if (editor)
      {
        this.folder = Path.normalize(Path.dirname(editor.document.fileName));
        this.isvalid = true;
      }
      else 
      {
        this.folder = '';
        this.isvalid = false;
        vscode.window.showWarningMessage("Please select a valid folder or file to add script.");
        return;
      }
    }

    let ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.folder));
    if (!ws) 
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("workspace is not located");
      return;
    }
    this.unityPorjectRoot = Path.normalize(ws.uri.fsPath);
    this.unityAssetRoot = `${this.unityPorjectRoot}\\Assets`;

    if (!fs.existsSync(`${this.unityPorjectRoot}\\ProjectSettings\\ProjectVersion.txt`) ||
      !fs.existsSync(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("workspace is not a valid unity project");
      return;
    }
    if (!this.folder.startsWith(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showWarningMessage("target folder is not part of unity assets");
      return;
    }
    this.isEditor = Path.relative(this.unityAssetRoot, this.folder).indexOf('\\Editor') >= 0;
  }

  async Apply()
  {
    this.GetCSprojectName(this.folder)
      .then(async s =>
      {
        if (this.isvalid) 
        {
          this.csProjectPath = s;
          return await this.buildFiles()
            .then(add => this.writeFiles(...add)
              .then(path => this.editCSProject(...path)
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

  async GetCSprojectName(path: string): Promise<string>
  {
    if (path.endsWith(".asmdef"))
    {
      return exists(path).then(x =>
      {
        if (x) { return this.retriveCsprojectPathFromYaml(path); }
        else { return this.retriveCsprojectPathFromYaml(); } //get default csproject name
      });
    }
    else
    {
      if (this.csProjectPath.startsWith(path)) { return this.retriveCsprojectPathFromYaml(); }
      else if (fs.lstatSync(path).isDirectory())
      {
        return readdir(path).then(files =>
        {
          for (let len = files.length, i = 0; i < len; i++)
          {
            let fn = files[i];
            if (fn.endsWith(".asmdef"))
            { return this.retriveCsprojectPathFromYaml(`${path}\\${fn}`); }
          }
          return this.GetCSprojectName(Path.dirname(path));
        });
      }
      else { return this.GetCSprojectName(Path.dirname(path)); }
    }
  }

  async retriveCsprojectPathFromYaml(yamlPath?: string): Promise<string>
  {
    if (yamlPath)
    {
      try
      {
        let doc = yaml.safeLoad((await readFile(yamlPath)).toString());
        if (doc.name) { return `${this.unityPorjectRoot}\\${doc.name}.csproj`; }
      }
      catch (e) { vscode.window.showWarningMessage(`invalid asmdef file found at ${yamlPath} \n using default unity csprojects...`); }
    }

    if (this.isEditor) { return `${this.unityPorjectRoot}\\Assembly-CSharp.csproj`; }
    else { return `${this.unityPorjectRoot}\\Assembly-CSharp-Editor.csproj`; }
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

  async editCSProject(...paths: string[]): Promise<string>
  {
    let xmlSrc = (await readFile(this.csProjectPath)).toString();
    let root = xml.xml2js(xmlSrc);
    let elem = root;
    if (elem) { elem = (elem.elements as xml.Element[]).find((e) => e.name === 'Project')!; }
    if (elem) { elem = (elem.elements as xml.Element[]).find((e) => e.name === 'ItemGroup')!; }
    if (elem)
    {
      for (let i = 0, len = paths.length; i < len; i++)
      {
        let newElem: xml.Element = {} as xml.Element;
        newElem.name = "Compile";
        newElem.attributes = { Include: Path.relative(this.unityPorjectRoot, paths[i]) };
        newElem.type = "element";
        (elem.elements as xml.Element[]).push(newElem);
      }
      let out = xml.js2xml(root);
      fs.writeFileSync(this.csProjectPath, out.split('><').join('>\n<'));
      vscode.window.showInformationMessage([`Fils added to ${Path.basename(this.csProjectPath)}`, ...paths].join("\n\t"));


      return paths.pop()!;
    }
    else { return `invalid csporj xml format`; }
  }

  async buildFiles(): Promise<[string, any][]>
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
      let placeholders: any = content.slice(2, firstlineEnd);
      placeholders = JSON.parse(placeholders);
      let replaces: Array<{ placeholder: string, param?: string, input?: string }> = placeholders.replace;
      content = content.slice(firstlineEnd + 1);
      for (let i = 0, len = replaces.length; i < len; i++)
      {
        let rep = replaces[i];
        let newContent: string | undefined = undefined;
        if (rep.input)
        {
          newContent = await vscode.window.showInputBox({ value: rep.placeholder, prompt: rep.input });
          if (newContent === undefined) { throw new Error("user canceled"); }
        }
        else if (rep.param === "$basename")
        { newContent = Path.basename(filename, ".cs"); }
        if (newContent === undefined) { throw new Error("Invalid replace JSON header"); }
        content = content.replace(rep.placeholder, newContent);
      }
    }
    catch (e) { throw new Error("Placeholder script Failed"); }

    return [[`${this.folder}\\${filename}`, content]];
  }

  async initOrGetTemplatPath(): Promise<string>
  {
    let templatePath = `${this.unityAssetRoot}\\ScriptTemplates`;
    if (!fs.existsSync(templatePath)) { fs.mkdirSync(templatePath); }

    let asmdefPath = `${templatePath}\\template.asmdef`;
    if (!fs.existsSync(asmdefPath)) { fs.writeFileSync(asmdefPath, asmdefsrc); }

    let monotplPath = `${templatePath}\\MonoBehaviour.tpl.cs`;
    if (!fs.existsSync(monotplPath)) { fs.writeFileSync(monotplPath, MonoBehaviourTpl); }

    let editortplPath = `${templatePath}\\Editor.tpl.editor.cs`;
    if (!fs.existsSync(editortplPath)) { fs.writeFileSync(editortplPath, EditorTpl); }

    let sotplPath = `${templatePath}\\ScriptableObject.tpl.cs`;
    if (!fs.existsSync(sotplPath)) { fs.writeFileSync(sotplPath, ScriptableObjectTpl); }

    let cstplPath = `${templatePath}\\CSharpClass.tpl.cs`;
    if (!fs.existsSync(cstplPath)) { fs.writeFileSync(cstplPath, csharpClassObjectTpl); }

    return templatePath;
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

const MonoBehaviourTpl = '//{"replace":[{"placeholder":"NewMono","param":"$basename"}]}\nusing UnityEngine;\npublic class NewMono : MonoBehaviour\n{\n}';
const EditorTpl = '//{"replace":[{"placeholder":"NewMono","param":"$basename"}]}\nusing UnityEngine;\nusing UnityEditor;\n[CustomEditor(typeof(NewMono))]\npublic class _MonoName_Editor : Editor\n{\n}';
const ScriptableObjectTpl = '//{"replace":[{"placeholder":"NewScript","param":"$basename"}]}\nusing UnityEngine;\n\npublic class NewScript : ScriptableObject\n{\n}';
const csharpClassObjectTpl = '//{"replace":[{"placeholder":"NewClass","param":"$basename"},{"placeholder":"NameSpace","input":"namespace"}]}\nusing UnityEngine;\nnamespace NameSpace\n{\n  public class NewClass\n  {  \n}\n}';
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

