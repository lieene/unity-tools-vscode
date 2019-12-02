# Unity Helper README

This extenstion is aim to speed up unity development.

For now it just has add new file function with asmdef file parsing and template editing

## Features

### Usage

press **F1** or **ctrl-shift-p** and type `addunityscript` and follow prompts

or

right click on file/folder in workspace and select  `Add Unity Script`

### Add New File

- asmdef file parsing: new csharp script will be added to the csproj defined be it's controling asmdef file, or defulat("Assembly-CSharp/Assembly-CSharp-Editor") if it is not controled by and asmdef file.
  
- templating: when the extension run for the first time in the current unity project. it will generate 3 template for new file contents. These template are located in Asset\\ScriptTemplates. a asmref file will also be created in the folder. this template is never reference in Editor/Builds. but they can utilize linter as the asmdef creates a valid csproj. the rule for template is those with **".tpl.cs"** can be used in none-editor folder and **".tpl.editor.cs"** can be used in editor folder. and the text in the template that matches regex: **/\_.\*Name\_/** will be replaced by filename.

>template `public Class _someName\_{}` will be replace by `public Class NewFile\_{}` when created with the name **NewFile.cs**

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
