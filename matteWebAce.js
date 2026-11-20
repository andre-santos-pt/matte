import "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/theme-solarized_light";
import "ace-builds/src-noconflict/theme-solarized_dark";

import MatteAceEditor from "./src/matte-ace-editor.js";
import {
    ExtensionProcedure,
    ExtensionType,
    RuntimeErrorType
} from "./src/Interpreter.ts";
import {PrimitiveType} from "./src/ast.ts";
import {ErrorMessagesPt} from "./src/error-messages-pt.ts";

import {callstack_matte} from "./src/callstack-matte.ts";

window.callstack_matte = callstack_matte;

window.flatTrace = (trace) => {
    if(trace.children)
        return [trace, ... trace.children.flatMap(t => window.flatTrace(t))]
    else
        return [trace]
}

window.sysout_matte = (editor) => {
    function prettyPrint(obj) {
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

    let consoleText = [];
    const consoleDiv = document.createElement("div");
    consoleDiv.style.cssText = 'padding: 5px; min-height: 50px; font-size: 20px; font-family: monospace; color: white; background-color: black; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow: auto;';
    editor.addExtensionProcedure(new ExtensionProcedure(args => {
        const argsText = prettyPrint(args[0].evaluation)
        consoleText.push(argsText + "<br>");
        return {
            evaluation: undefined,
            materialization: `println(${argsText})`,
            extension: "sysout"
        }
    }, PrimitiveType.VOID, "println"));

    editor.addExtensionProcedure(new ExtensionProcedure( args => {
        const argsText = prettyPrint(args[0].evaluation)
        consoleText.push(argsText);
        return {
            evaluation: undefined,
            materialization: `print(${argsText})`,
            extension: "sysout"
        }
    }, PrimitiveType.VOID, "print"));

    editor.beforeRunListeners.push(() => {
        consoleText = [];
    })
    editor.afterRunListeners.push(() => {
        consoleDiv.innerHTML = consoleText.join("");
    })

    editor.stepListeners.push((trace, index) => {
        let c = 0;
        for (let i = 0; i < index; i++)
            if (trace[i].extension === "sysout")
                c++;
        consoleDiv.innerHTML = consoleText.slice(0, c).join("")
    });
    return consoleDiv;
}




const matteDivs = new Set();

function initializeMatteAce(element) {
    if (element.editor) {
        requestAnimationFrame(() => {
            if (element.isConnected)
                element.editor?.editor.resize();
        });
        return;
    }
    const div = document.createElement("div");
    div.id = element.getAttribute('id');
    div.style = 'display: block;';
    const childTags = Array.from(element.children);
    Array.from(element.children).forEach(c => c.remove());
    div.innerHTML = (element.innerHTML.startsWith("\n") ? element.innerHTML.substring(1) : element.innerHTML).trim();
    element.innerHTML = '';
    element.append(div);
    let call = element.getAttribute("call");
    if(!call)
        call = element.getAttribute("data-call");
    const editor = new MatteAceEditor(div, element.getAttribute("width"), element.getAttribute("height"), call);
    element.editor = editor;
    if (element instanceof HTMLDivElement)
        matteDivs.add(element);

    Array.from(element.attributes).filter(attr => attr.value === '').reverse().forEach(attr => {
        const extName = attr.name + "_matte";
        if (window[extName]) {
            const extDiv = window[extName].call(element, editor, childTags);
            if(extDiv instanceof HTMLDivElement) {
                const div = document.createElement("div")
                div.style.border = "1px solid gray";
                div.style.marginTop = "5px"
                div.append(extDiv)
                editor.addExtension(div)
            }
        }
        if(window[attr.name + "_matte_include"])
            editor.include = window[attr.name + "_matte_include"]
    });
    if(element.hasAttribute("disable-compilation-hints")) {
        editor.disableCompilationHints();
    }
    if(element.hasAttribute("pt")) {
        editor.errorMessageHandler = new ErrorMessagesPt()
    }
    editor.runPreprocessors()
}

class MatteAce extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        initializeMatteAce(this);
    }

    disconnectedCallback() {
        queueMicrotask(() => {
            if (this.isConnected)
                return;
            this.editor?.dispose();
            this.editor = null;
        });
    }
}

function initializeMatteDivs(root) {
    if (root instanceof HTMLDivElement && root.classList.contains("matte-ace"))
        initializeMatteAce(root);
    root.querySelectorAll?.("div.matte-ace").forEach(initializeMatteAce);
}

const matteDivObserver = new MutationObserver(records => {
    for (const record of records) {
        if (record.type === "attributes")
            initializeMatteDivs(record.target);
        else
            record.addedNodes.forEach(initializeMatteDivs);
    }
    for (const element of matteDivs) {
        if (!element.isConnected) {
            queueMicrotask(() => {
                if (element.isConnected)
                    return;
                element.editor?.dispose();
                element.editor = null;
                matteDivs.delete(element);
            });
        }
    }
});

if (document.documentElement) {
    initializeMatteDivs(document);
    matteDivObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true
    });
}

window.Matte = { ExtensionProcedure, ExtensionType, PrimitiveType, RuntimeErrorType };

try {
    customElements.define('matte-ace', MatteAce);
} catch
    (e) {
    console.error('matte-ace definition failed:', e);
}
