# Unity Helper README

This extenstion is aim to speed up unity development.

For now it has two features:

- add new file function with asmdef file parsing and template editing
- unity project version managing (version increament and git auto tag and pushing)

## Features

### Usage

- to add New file

  press `F1` or `ctrl+shift+p` and type `addunityscript` / right click on file/folder in workspace and select  `Add Unity Script` and follow prompts
- to update unity version
  press `F1` or `ctrl+shift+p` and type `unityappversion` and follow prompts


### Add New File

- asmdef file parsing: new csharp script will be added to the csproj defined be it's controling asmdef file, or defulat("Assembly-CSharp/Assembly-CSharp-Editor") if it is not controled by and asmdef file.
  
- templating: when the extension run for the first time in the current unity project. it will generate 3 template for new file contents. These template are located in `\Asset\ScriptTemplates`. a asmref file will also be created in the folder. this template is never reference in Editor/Builds. but they can utilize linter as the asmdef creates a valid csproj.

- the rule for template file name is: those with `.tpl.cs` can be used in none-editor folder and `.tpl.editor.cs` can be used in editor folder.
  
- template can has json replacement setting in the first line commnet.
  - each key is a JS regex matching what to replace (globally in the template file).  
  - value start with `$` is recognized as variable. $basename is built-in variable containing the new file name without extension. other variable can be defined in `variables.json` in `\Asset\ScriptTemplates`. if the variable is not found a input box will show up asking for user input.
  - value start with `#` is relative path to namespace converter. path up-to the string value will be converted to dot spread namespace. if the value is not found up to `\Asset` folder. the string value it self will be returned.
  - other string value will trigger a a input box for user input.

>template `public Class _someName\_{}` will be replace by `public Class NewFile\_{}` when created with the name **NewFile.cs**

### Unity Project version managing

- optional add=>commit=>push git repo content
- update unity project version (Major/Minor/Patch/Build)
- added version tag to git project
- submit version and tag to git repo
- unity project version follows pattern Major.Minor.Patch and extra (IOS/Andriod) build number
  - Increasing version number to the left will reset all version to the left to 0
  - Android build number is a excetion as it need to be unique not it self so it is never rested

---------

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---------
