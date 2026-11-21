import MatteAceEditor from "./matte-ace-editor";

export enum SettingProperty {
    Theme = "theme",
    FontSize = "fontsize",
    LineNumbers = "linenumbers",
    HighlightActiveLine = "linehighlight",
    AutoRun = "autorun",
    AutoCompile = "autocompile",
    CompilationHints = "compilationhints",
    VariableMaterialization = "variablematerialization",
    CumulativeTrace = "cumulativetrace",
    MaxLoopIterations = "maxLoopIterations",
    MaxCallStack = "maxCallStack"
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

const settingsConf: Record<SettingProperty, SettingsConf> = {
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
    [SettingProperty.AutoRun]: {
        label: "Auto run"
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

export class Settings {
    [SettingProperty.Theme]: string = "ace/theme/textmate";
    [SettingProperty.FontSize]: number = 14;
    [SettingProperty.LineNumbers]: boolean = false;
    [SettingProperty.HighlightActiveLine]: boolean = false;
    [SettingProperty.AutoRun]: boolean = false;
    [SettingProperty.AutoCompile]: boolean = true;
    [SettingProperty.CompilationHints]: boolean = true;
    [SettingProperty.VariableMaterialization]: boolean = true;
    [SettingProperty.CumulativeTrace]: boolean = true;
    [SettingProperty.MaxLoopIterations]: number | undefined = 100;
    [SettingProperty.MaxCallStack]: number | undefined = 100;

    editor: MatteAceEditor;
    containerGenId: string = Math.random().toString(36).substring(2, 15);

    constructor(editor: MatteAceEditor) {
        this.editor = editor;
    }

    createSettingsMenu(): HTMLElement {
        const host = this.editor.container.parentElement
        if (!host)
            return document.createElement("details");
        host.style.display = "block";
        if (window.getComputedStyle(host).position === "static")
            host.style.position = "relative";

        const details = document.createElement("details");
        details.className = "matte-ace-settings";

        const summary = document.createElement("summary");
        summary.textContent = "\u2630";
        summary.title = "Editor settings";
        summary.setAttribute("aria-label", "Editor settings");
        details.append(summary);

        const panel = document.createElement("div");
        panel.className = "matte-ace-settings-panel";
        details.append(panel);

        const addSelect = (
            settingsKey: string,
            labelText: string,
            values: Array<[string, string]>,
            selectedValue: string,
            onChange: (value: string) => void
        ): void => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const select = document.createElement("select");
            select.id = this.containerGenId + "-" + settingsKey;
            for (const [value, text] of values) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = text;
                select.append(option);
            }
            select.value = selectedValue;
            select.addEventListener("change", () => onChange(select.value));
            label.append(select);
            panel.append(label);
        };

        const addPositiveNumber = (
            settingsKey: string,
            labelText: string,
            value: string,
            onChange: (value: number | undefined) => void
        ): void => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.id = this.containerGenId + "-" + settingsKey;
            input.type = "number";
            input.min = "0";
            input.step = "any";
            input.value = value;
            input.addEventListener("change", () => {
                const number = input.valueAsNumber;
                if (input.value.trim().length === 0)
                    onChange(undefined);
                else if (Number.isFinite(number) && number > 0)
                    onChange(number);
                else
                    input.value = value;
            });
            label.append(input);
            panel.append(label);
        };

        const addCheckbox = (
            settingId: string,
            labelText: string,
            checked: boolean,
            onChange: (checked: boolean) => void
        ): void => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.id = this.containerGenId + "-" + settingId;
            input.type = "checkbox";
            input.checked = checked;
            input.addEventListener("change", () => onChange(input.checked));
            label.append(input);
            panel.append(label);
        };

        Object.values(SettingProperty).forEach(key => {
            const value = this[key];
            const callback = (show: any) => {
                const action = settingsConf[key].action
                if(action)
                    action.call(null, this.editor, show)
                else
                { // @ts-ignore
                    this[key] = show
                }
            };
            if(settingsConf[key]?.options) {
                addSelect(
                    key,
                    settingsConf[key].label,
                    settingsConf[key].options!.map(option => [option.value, option.label || option.value]),
                    value?.toString() ?? "N/A",
                    callback
                );
            }
            else if(typeof value === "boolean")
            { // @ts-ignore
                addCheckbox(key, settingsConf[key]?.label || key, value, callback);
            }
            else if (typeof value === "number")
            { // @ts-ignore
                addPositiveNumber(key, settingsConf[key]?.label || key, value, callback);
            }
        })
        host.append(details);
        return details;
    }

    enable(key: string): void {
        // @ts-ignore
        this[key] = true;
        const checkbox = document.getElementById(this.containerGenId + "-" + key) as HTMLInputElement | null;
        if (checkbox)
            checkbox.checked = true;

        // @ts-ignore
        const action = settingsConf[key]?.action
        if(action)
            action.call(null, this.editor, true)
    }

    disable(key: string): void {
        // @ts-ignore
        if(this[key] === undefined)
            console.error(`Setting '${key}' does not exist in MatteAceEditor settings.`);
        // @ts-ignore
        this[key] = false;
        const checkbox = document.getElementById(this.containerGenId + "-" + key) as HTMLInputElement | null;
        if (checkbox)
            checkbox.checked = false;

        // @ts-ignore
        const action = settingsConf[key]?.action
        if(action)
            action.call(null, this.editor, false)
    }

    set(key: string, value: any) {
        // @ts-ignore
        if(this[key] === undefined)
            console.error(`Setting '${key}' does not exist in MatteAceEditor settings.`);
        // @ts-ignore
        this[key] = value;
        const input = document.getElementById(this.containerGenId + "-" + key) as HTMLInputElement | null;
        if (input)
            input.value = value;
        // @ts-ignore
        const action = settingsConf[key]?.action
        if(action)
            action.call(null, this.editor, value)
    }
}



