import MatteAceEditor from "./matte-ace-editor.js";

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

window.callstack_matte = (editor) => {
    function stack(n) {
        if(!n.parent)
            return [];
        else
            return [...stack(n.parent), n.parent]
    }

    function getDifferenceRange(strA, strB) {
        let start = 0;

        // 1. Scan from the left to find the first differing character
        while (start < strA.length && start < strB.length && strA[start] === strB[start]) {
            start++;
        }

        // If strings are completely identical
        if (start === strA.length && start === strB.length) {
            return null;
        }

        let endA = strA.length - 1;
        let endB = strB.length - 1;

        // 2. Scan from the right to find the last differing character
        while (endA >= start && endB >= start && strA[endA] === strB[endB]) {
            endA--;
            endB--;
        }

        return { start, end: endA };
    }

    function highlightDiffInHtml(str, range) {
        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        // If there are no differences, just return the safe HTML string
        if (!range) {
            return escapeHtml(str);
        }

        const { start, end } = range;

        // Validate range bounds
        if (start < 0 || end >= str.length || start > end) {
            return escapeHtml(str);
        }

        // Split the string into three parts: before, the difference, and after
        const before = str.slice(0, start);
        const diffPart = str.slice(start, end + 1); // +1 because 'end' is inclusive
        const after = str.slice(end + 1);

        // Reassemble with the <mark> tag around the difference
        return `${escapeHtml(before)}<mark>${escapeHtml(diffPart)}</mark>${escapeHtml(after)}`;
    }

    const div = document.createElement('div');
    div.style.cssText = 'padding: 5px; min-height: 10px; font-family: monospace; color: black; background-color: lightgray;';
    editor.stepListeners.push((t, i) => {
        let html = ""
        const s = stack(t[i])
        for(let j = 0; j < s.length; j++) {
            html += "<span style='font-family: monospace'>"
            for (let d = j; d !== 0; d--)
                html += "&nbsp;&nbsp;&nbsp;&nbsp;"
            html += "&#8627;&nbsp;" + s[j].materialization

            for (let r = i; r >= 0; r--)
                if (t[r].returnStatement && t[r].parent === s[j]) {
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
        const editor = new MatteAceEditor(div, this.getAttribute("width"), this.getAttribute("height"), this.getAttribute("call"));

        Array.from(this.attributes).filter(attr => attr.value === '').reverse().forEach(attr => {
            const extName = attr.name + "_matte";
            if (window[extName]) {
                const extDiv = window[extName].call(this, editor);
                if(!(extDiv instanceof HTMLDivElement))
                    console.error("Extension '" + extName + "' did not return a DIV");

                const div = document.createElement("div")
                div.style.border = "1px solid gray";
                div.style.marginTop = "5px"
                div.append(extDiv)
                editor.addExtension(div)
                // editor.container.append(div)
            }
        });
        // if (this.hasAttribute("callbar") || this.hasAttribute("call")) {
        //     const call = this.hasAttribute("call") ? this.getAttribute("call") : "";
        //     editor.addCallBox(call);
        // }
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



