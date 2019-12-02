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
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as Path from "path";
import * as vscode from "vscode";
import { promisify } from "util";
export interface AddArg
{
  folder: string;
  isEditor?: boolean;
  template?: string;
  factoryParams?: any[];
}

export function AddArg(folder: string, isEditor: boolean, template?: string, ...factoryParams: any[])
{
  if (factoryParams && factoryParams.length === 0) { factoryParams = undefined as any; }
  return { folder, isEditor, template, factoryParams };
}

export class AddUnityScript implements AddArg
{
  constructor(arg?: AddArg)
  {
    if (arg) 
    {
      this.folder = Path.normalize(arg.folder);
      this.isEditor = arg.isEditor;
      this.template = arg.template;
      this.factoryParams = arg.factoryParams;
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
        vscode.window.showInformationMessage("Please select a valid folder or file to add script.");
        return;
      }
    }
    let ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.folder));
    if (!ws) 
    {
      this.isvalid = false;
      vscode.window.showInformationMessage("workspace is not located");
      return;
    }
    this.unityPorjectRoot = Path.normalize(ws.uri.fsPath);
    this.unityAssetRoot = `${this.unityPorjectRoot}\\Assets`;

    if (!fs.existsSync(`${this.unityPorjectRoot}\\ProjectSettings\\ProjectVersion.txt`) ||
      !fs.existsSync(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showInformationMessage("workspace is not a valid unity project");
      return;
    }
    if (!this.folder.startsWith(this.unityAssetRoot))
    {
      this.isvalid = false;
      vscode.window.showInformationMessage("target folder is not part of unity assets");
      return;
    }
  }

  async Apply(): Promise<string>
  {
    this.csProjectName = this.GetCsprojectName(this.folder)!;
    if (!this.isvalid) { throw new Error("csproject not found"); }

  }


  async GetCsprojectName(path: string): Promise<string>
  {
    if (path.endsWith(".asmdef"))
    {
      fs.exists(path, x =>
      {
        if (x)
        {
          let doc = yaml.safeLoad(fs.readFileSync(path).toString());
          doc.name;

        }
        else
        {
          this.isvalid = false;
          throw new Error(`Asmdef file not found at: ${path}`);
        }
      });
    }
    else
    {
      let pp = Path.parse(path);
      pp.dir = path = `${pp.dir}\\${pp.name}`;
      let found = false;
      fs.readdir(path, (e, files) =>
      {
        for (let len = files.length, i = 0; i < len; i++)
        {
          let fn = files[i];
          if (fn.endsWith(".asmdef")) { pp.base = fn; found = true; break; }
        }
        if (found)
        {
          //console.log(`asmdef found in dir: ${pp.dir}`);
          path = Path.format(pp);
        }
        else
        {
          //console.error(`asmdef Not found in dir: ${pp.dir}`);
          return this.GetCsprojectName(Path.dirname(path));
          //return undefined;
        }
      });

      //else { console.log(`with .asmdef found at: ${path}`); }
    }
  }

  getDefualtCSProjectPath()
  {
  }
  retriveCsprojectNameFromYaml(yamlPath: string)
  {
    let doc = yaml.safeLoad(fs.readFileSync(yamlPath).toString());
    return doc.name;
  }

  folder: string;
  isEditor?: boolean;
  template?: string;
  factoryParams?: any[];
  isvalid: boolean;

  unityPorjectRoot: string = '';
  unityAssetRoot: string = '';
  csProjectName: string = '';
}

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

