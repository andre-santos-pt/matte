import MatteAceEditor from "./matte-ace-editor";

export enum SettingProperty {
    Theme = "theme",
    FontSize = "fontSize",
    LineNumbers = "linenumbers",
    HighlightActiveLine = "linehighlight",
    AutoCompile = "autocompile",
    CompilationHints = "compilationhints",
    VariableMaterialization = "variablematerialization",
    CumulativeTrace = "cumulativetrace",
    MaxLoopIterations = "maxLoopIterations",
    MaxCallStack = "maxCallStack"
}

export class Settings {
    [SettingProperty.Theme]: string = "ace/theme/textmate";
    [SettingProperty.FontSize]: number = 14;
    [SettingProperty.LineNumbers]: boolean = false;
    [SettingProperty.HighlightActiveLine]: boolean = false;
    [SettingProperty.AutoCompile]: boolean = true;
    [SettingProperty.CompilationHints]: boolean = true;
    [SettingProperty.VariableMaterialization]: boolean = true;
    [SettingProperty.CumulativeTrace]: boolean = true;
    [SettingProperty.MaxLoopIterations]: number | undefined = 100;
    [SettingProperty.MaxCallStack]: number | undefined = 100;
}

interface Option {
    value: string;
    label?: string;
}

interface SettingsConf {
    label: string;
    options?: Option[];
    action?: (editor: MatteAceEditor, value: any) => void;
}

export const settingsConf: Record<SettingProperty, SettingsConf> = {
    [SettingProperty.Theme]: {
        label: "Theme",
        options: [
            { value: "ace/theme/textmate", label: "TextMate" },
            { value: "ace/theme/monokai", label: "Monokai" },
            { value: "ace/theme/github", label: "GitHub" },
            { value: "ace/theme/solarized_light", label: "Solarized Light" },
            { value: "ace/theme/solarized_dark", label: "Solarized Dark" }
        ],
        action: (editor, value) => editor.editor.setTheme(value)
    },
    [SettingProperty.FontSize]: {
        label: "Font size",
        options: [
            { value: "10"},
            { value: "12"},
            { value: "14"},
            { value: "16"},
            { value: "18"},
            { value: "20"},
            { value: "22"},
            { value: "24"}
        ],
        action: (editor, value) => editor.editor.setFontSize(Number(value))
    },
    [SettingProperty.LineNumbers]: {
        label: "Line numbers",
        action: (editor, value) => {
            editor.editor.setOption("showLineNumbers", value);
            editor.editor.setOption("showGutter", value);
        }
    },
    [SettingProperty.HighlightActiveLine]: {
        label: "Highlight active line",
        action: (editor, value) => {
            editor.editor.setOption("highlightActiveLine", value);
        }
    },
    [SettingProperty.AutoCompile]: {
        label: "Auto compile"
    },
    [SettingProperty.CompilationHints]: {
        label: "Compilation hints",
    },
    [SettingProperty.VariableMaterialization]: {
        label: "Variable materialization",
    },
    [SettingProperty.CumulativeTrace]: {
        label: "Cumulative trace",
    },
    [SettingProperty.MaxLoopIterations]: {
        label: "Max loop iterations",
    },
    [SettingProperty.MaxCallStack]: {
        label: "Max call stack",
    }
}