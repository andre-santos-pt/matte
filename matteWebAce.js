import MatteAceEditor from "./matte-ace-editor.js";

window.sysout = (editor) => {
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
    consoleDiv.style.cssText = 'padding: 5px; font-size: 20px; font-family: monospace; background: lightgray; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow: auto;';

    editor.addExtensionProcedure("println", args => {
        const argsText = prettyPrint(args[0])
        consoleText.push(argsText + "<br>");
        return {
            evaluation: undefined,
            materialization: `println(${argsText})`,
            extension: "sysout"
        }
    });

    editor.addExtensionProcedure("print", args => {
        const argsText = prettyPrint(args[0])
        consoleText.push(argsText);
        return {
            evaluation: undefined,
            materialization: `print(${argsText})`,
            extension: "sysout"
        }
    });

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

window.callstack = (editor) => {
    function stack(n) {
        if(!n.parent)
            return [];
        else
            return [...stack(n.parent), n.parent]
    }
    const div = document.createElement('div');
    editor.stepListeners.push((t, i) => {
        let html = ""
        const s = stack(t[i])
        for(let j = 0; j < s.length; j++) {
            html += "<span style='font-family: monospace'>"
            for (let d = j; d !== 0; d--)
                html += "&nbsp;&nbsp;&nbsp;&nbsp;"
            html += "&#8627;&nbsp;" + s[j].materialization // TODO call mat

            for(let r = i; r >= 0; r--)
                if(t[r].returnStatement && t[r].parent === s[j]) {
                    html += " \u279c " + t[r].materialization
                    break
                }

            html += "</span><br>"
        }
        div.replaceChildren()
        div.innerHTML = html
    })
    return div
}

class MatteAce extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        const div = document.createElement("div");
        div.id = this.getAttribute('id');
        div.style = 'display: block;';
        div.innerHTML = this.innerHTML.startsWith("\n") ? this.innerHTML.substring(1) : this.innerHTML;
        this.innerHTML = '';
        this.append(div);
        const editor = new MatteAceEditor(div, this.getAttribute("width"), this.getAttribute("height"));

        Array.from(this.attributes).filter(attr => attr.name.startsWith("ext-")).forEach(attr => {
            const extName = attr.name.substring(4);
            if (window[extName]) {
                const extDiv = window[extName].call(this, editor);
                if(!(extDiv instanceof HTMLDivElement))
                    console.error("Extension '" + extName + "' did not return a DIV");

                const div = document.createElement("div")
                div.style.border = "1px solid gray";
                div.style.padding = "5px";
                div.style.background = "#ececec";
                extDiv.style.background = div.style.background;
                div.append(extDiv)
                editor.container.after(div)
            }
        });
        if (this.hasAttribute("callbar") || this.hasAttribute("call")) {
            const call = this.hasAttribute("call") ? this.getAttribute("call") : "";
            editor.addCallBox(call);
        }
        if(this.hasAttribute("disable-compilation-hints")) {
            editor.disableCompilationHints();
        }
    }
}

try {
    customElements.define('matte-ace', MatteAce);
} catch
    (e) {
    console.error('matte-ace definition failed:', e);
}



