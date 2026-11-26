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
import {sysout_matte} from "./src/sysout-matte.ts";
import {compile} from "./src/antlr2ast.ts";

window.callstack_matte = callstack_matte;
window.sysout_matte = sysout_matte;
window.compile = compile;

window.flatTrace = (trace) => {
    if(trace.children)
        return [trace, ... trace.children.flatMap(t => window.flatTrace(t))]
    else
        return [trace]
}

const matteDivs = new Set();

function trimIndent(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");

    while (lines.length && lines[0].trim() === "")
        lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "")
        lines.pop();

    const indents = lines
        .filter(line => line.trim() !== "")
        .map(line => (line.match(/^[\t ]*/) ?? [""])[0].length);
    const indent = indents.length ? Math.min(...indents) : 0;

    return lines.map(line => line.trim() === "" ? "" : line.substring(indent)).join("\n");
}

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
    div.textContent = trimIndent(element.textContent ?? "");
    element.innerHTML = '';
    element.append(div);
    let call = element.getAttribute("call");
    if(!call)
        call = element.getAttribute("data-call");
    const editor = new MatteAceEditor(
        div,
        element.getAttribute("width"),
        element.getAttribute("height"),
        call,
        element.hasAttribute("readonly"),
        element.hasAttribute("norun")
    );
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
                editor.addExtension(div, element.getAttribute("location") ?? "bottom")
            }
        }
        if(window[attr.name + "_matte_include"])
            editor.include = window[attr.name + "_matte_include"]
    });
    Array.from(element.attributes).forEach(attr => {
        if(attr.name.startsWith("disable-"))
            editor.disable(attr.name.substring("disable-".length))
        else if(attr.name.startsWith("enable-"))
            editor.enable(attr.name.substring("enable-".length))
        else if(attr.name.startsWith("set-"))
            editor.setProperty(attr.name.substring("set-".length), attr.value)
    });

    if(element.hasAttribute("pt"))
        editor.errorMessageHandler = new ErrorMessagesPt()

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
