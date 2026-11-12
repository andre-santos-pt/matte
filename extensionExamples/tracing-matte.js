function tracing_matte(editor) {
    function collectDistinctSequenceOfValues(trace, varName) {
        const values = [];
        trace.map(t => t.stack.variables.get(varName)).forEach(t => {
            if (t !== undefined && t.evaluation !== values[values.length - 1])
                values.push(t.evaluation);
        });
        return values;
    }

    editor.disableVariableMaterialization()

    let div = document.createElement("div");
    div.style = "margin-top: .5em; margin-bottom: .5em; margin-left: .5em; margin-right: .5em;";
    let att = this.getAttribute("vars");
    let varNames;
    let textBoxes = {};

    editor.beforeRunListeners.push(() => {
        div.replaceChildren();
        textBoxes = {};
    });
    editor.afterRunListeners.push((r) => {
        if (att === null || att === undefined || att.trim() === "")
            varNames = Array.from(new Set(r.trace.children.map(t => t.stack.variables.keys().toArray()).flat()));
        else
            varNames = this.getAttribute("vars").split(",").map(v => v.trim());

        varNames.forEach((v, index) => {
            if (index > 0) div.appendChild(document.createElement("hr"));
            const span = document.createElement("span");
            span.innerHTML = "Write the sequence of values of variable <code>" + v + "</code>.";
            div.appendChild(span);
            const trace = collectDistinctSequenceOfValues(r.trace.children, v);
            trace.forEach(t => {
                const text = document.createElement("input");
                text.type = "text";
                text.style.cssText = "margin: 5px; padding: 3px; width: 20px;";
                const correct = t;
                text.addEventListener("change", () => {
                    if (text.value === correct.toString()) {
                        text.style.backgroundColor = "lightgreen";
                    } else {
                        text.style.backgroundColor = "salmon";
                    }
                });
                div.append(text);
                if (textBoxes[v] === undefined)
                    textBoxes[v] = [text]
                else
                    textBoxes[v].push(text);
            });
        })
    });
    return div;
}