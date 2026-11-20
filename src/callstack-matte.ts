import MatteAceEditor from "./matte-ace-editor";

export function callstack_matte(editor: MatteAceEditor) {
    function stack(n: any): any[] {
        if(!n.parent)
            return [];
        else
            return [...stack(n.parent), n.parent]
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