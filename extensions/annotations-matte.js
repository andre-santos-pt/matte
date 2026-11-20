function annotations_matte(editor) {
    const div = document.createElement("div");
    editor.setReadOnly(true);
    let comments = [];
    editor.preprocessors.push((p) => {
        const visitor = {
            visited: new WeakSet(),
            visit(node) {
                if (!node || typeof node !== "object" || this.visited.has(node))
                    return;
                this.visited.add(node);
                if(node.comment && node.comment.startsWith("*")) {
                    comments.push({range: node.range, comment: node.comment});
                    delete node.comment;
                }
                Object.values(node).forEach(value => {
                    if (Array.isArray(value))
                        value.forEach(child => child?.accept?.(this));
                    else
                        value?.accept?.(this);
                });
            }
        };
        p.accept(visitor);
        if(comments.length !== 0) {
            const ol = document.createElement("ul");
            comments.forEach((c, index) => {
                const li = document.createElement("li");
                const a = document.createElement("span")
                a.id = "c" + c.range.line;
                a.innerHTML = c.comment.substring(2);
                a.onmouseenter = () => {
                    editor.highlightLine(c.range.line,"range-highlight")
                    a.classList.add("range-highlight")
                };
                a.onmouseleave = () => {
                    editor.clearHighlight();
                    a.classList.remove("range-highlight")
                };
                li.append(a);
                ol.append(li);

            })
            div.append(ol);
        }
    });
    let item = undefined
    editor.stepListeners.push((trace, index) => {
       console.log(trace[index].range.line)
        if(item)
            item.classList.remove("range-highlight")
        item = document.getElementById("c" + trace[index].range.line)
        if(item)
            item.classList.add("range-highlight")
    });
    return div;
}
