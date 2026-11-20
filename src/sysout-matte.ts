import MatteAceEditor from "./matte-ace-editor";
import {ExtensionProcedure} from "./Interpreter";
import {PrimitiveType} from "./ast";

export function sysout_matte(editor: MatteAceEditor) {
    function prettyPrint(obj: any): string {
        if (obj === null || obj === undefined) return "null";
        if (typeof obj === "number" || typeof obj === "boolean") return obj.toString();
        if (Array.isArray(obj)) {
            return "[" + obj.map(prettyPrint).join(",&nbsp;") + "]";
        }
        if (typeof obj === "object") {
            let entries = Object.entries(obj).map(([key, value]) => `${key}: ${prettyPrint(value)}`);
            return "{" + entries.join(",&nbsp;") + "}";
        }
        return obj.toString();
    }

    let consoleText: string[] = [];
    const consoleDiv = document.createElement("div");
    consoleDiv.style.cssText = 'padding: 5px; min-height: 50px; font-size: 20px; font-family: monospace; color: white; background-color: black; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow: auto;';
    editor.addExtensionProcedure(new ExtensionProcedure(args => {
        const argsText = prettyPrint(args[0].evaluation);
        consoleText.push(argsText + "<br>");
        return {
            evaluation: undefined,
            materialization: `println(${argsText})`,
            extension: "sysout"
        };
    }, PrimitiveType.VOID, "println"));

    editor.addExtensionProcedure(new ExtensionProcedure(args => {
        const argsText = prettyPrint(args[0].evaluation);
        consoleText.push(argsText);
        return {
            evaluation: undefined,
            materialization: `print(${argsText})`,
            extension: "sysout"
        };
    }, PrimitiveType.VOID, "print"));

    editor.beforeRunListeners.push(() => {
        consoleText = [];
    });
    editor.afterRunListeners.push(() => {
        consoleDiv.innerHTML = consoleText.join("");
    });

    editor.stepListeners.push((trace, index) => {
        let c = 0;
        for (let i = 0; i < index; i++)
            if (trace[i].extension === "sysout")
                c++;
        consoleDiv.innerHTML = consoleText.slice(0, c).join("");
    });
    return consoleDiv;
}
