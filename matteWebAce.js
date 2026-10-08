import MatteAceEditor from "./matte-ace-editor.js";
import {Interpreter} from './dist/matte.js';


window.createMatteAceEditor = (container, width, height) => {
    return new MatteAceEditor(container, width, height);
}

window.matte = (input, call) => {
    const interpreter = new Interpreter();
    return interpreter.parseAndRun(input, call);
}

function consoleExtension(editor) {
    const consoleDiv = document.createElement("div");
    consoleDiv.style.cssText = 'border: 3px solid #000; min-height: 100px; max-height: 300px; width: 400px; padding: 5px; font-size: 20px; font-family: monospace; background: lightgray; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow: auto;';

    editor.extensions["print"] = (o) => this.consoleText.push(o.toString())
    editor.extensions["println"] = (o) => this.consoleText.push(o.toString() + '<br>')
    editor.extensions["clear"] = () => this.consoleText = [];
    editor.container.after(consoleDiv);
    editor.beforeRunListeners.push(() => {
        this.consoleText = [];
    })
    editor.afterRunListeners.push(() => {
        consoleDiv.innerHTML = this.consoleText.join("");
    })

    // TODO last step
    editor.stepListeners.push((trace, index) => {
        let c = 0;
        for (let i = 0; i < index; i++)
            if (trace[i].call === 'print' || trace[i].call === 'println')
                c++;
        consoleDiv.innerHTML = this.consoleText.slice(0, c).join("")
    });
}

window.callstack = (editor) => {
    function stack(n) {
        if(!n.parent)
            return [];
        else
            return [...stack(n.parent), n.parent]
    }
    const div = document.createElement('div');
    editor.afterRunListeners.push((r) => console.log(editor.trace))
    editor.stepListeners.push((t, i) => {
        let html = ""
        const s = stack(t[i])
        for(let j = 0; j < s.length; j++) {
            html += "<span style='font-family: monospace'>"
            for (let d = j; d !== 0; d--)
                html += "&nbsp;&nbsp;&nbsp;&nbsp;"
            html += "&#8627;&nbsp;" + s[j].materialization

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
        this.consoleText = [];
    }

    connectedCallback() {
        const div = document.createElement("div");
        div.id = this.getAttribute('id');
        div.style = 'display: block;';
        div.innerHTML = this.innerHTML.startsWith("\n") ? this.innerHTML.substring(1) : this.innerHTML;
        this.innerHTML = '';
        this.append(div);
        const editor = window.createMatteAceEditor(div, this.getAttribute("width"), this.getAttribute("height"));

        if (this.hasAttribute("console"))
            consoleExtension.call(this, editor);

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
    }
}

// TODO: frame view

try {
    customElements.define('matte-ace', MatteAce);
} catch
    (e) {
    console.error('matte-ace definition failed:', e);
}