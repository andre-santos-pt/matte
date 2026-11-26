function controlflow_matte(editor) {
    const root = document.createElement("div");
    root.className = "control-flow";

    const toolbar = document.createElement("div");
    toolbar.className = "control-flow-toolbar";

    const label = document.createElement("label");
    label.textContent = "Control flow for";
    const select = document.createElement("select");
    label.append(select);
    toolbar.append(label);

    const graph = document.createElement("div");
    root.append(toolbar, graph);

    let compilation;
    let selectedIndex = 0;
    let renderSequence = 0;
    let viz;
    let activeRange;
    let activeEntry = false;
    let renderedNodes = [];
    let renderedEntryId;

    function sourceText(range) {
        if (!range)
            return "";
        return range.text ?? editor.getValue().slice(range.start, range.end);
    }

    function expressionText(expression) {
        return sourceText(expression?.range) || "?";
    }

    function makeProcedureLabel(procedure) {
        const owner = procedure.parent?.name;
        const parameters = (procedure.parameters ?? [])
            .map(parameter => `${parameter.type} ${parameter.name}`)
            .join(", ");
        return `${owner ? owner + "." : ""}${procedure.name}(${parameters})`;
    }

    function makeProcedureCall(procedure) {
        const parameters = (procedure.parameters ?? [])
            .slice(procedure.instance ? 1 : 0)
            .map(parameter => parameter.name)
            .join(", ");
        return `${procedure.name}(${parameters})`;
    }

    function getBodies(program) {
        const bodies = [];
        if (program.block)
            bodies.push({label: "(script)", body: program.block, entryLabel: "Entry"});
        (program.procedures ?? []).forEach(procedure => {
            if (procedure.body)
                bodies.push({
                    label: makeProcedureLabel(procedure),
                    body: procedure.body,
                    entryLabel: makeProcedureCall(procedure)
                });
        });
        return bodies;
    }

    function addOption(bodies, index) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = bodies[index].label;
        select.append(option);
    }

    function buildGraph(body, entryLabel) {
        const nodes = [];
        const edges = [];

        function addNode(text, kind, range) {
            const node = {id: nodes.length, text: text || "statement", kind, range};
            nodes.push(node);
            return node.id;
        }

        function addEdge(from, to, label) {
            if (from != null && to != null)
                edges.push({from, to, label: label || ""});
        }

        const entry = addNode(entryLabel || "Entry", "terminal");
        const exit = addNode("Exit", "terminal");

        function buildStatement(statement, next, breakTarget) {
            if (!statement)
                return next;

            if (Array.isArray(statement.statements)) {
                let start = next;
                for (let i = statement.statements.length - 1; i >= 0; i--)
                    start = buildStatement(statement.statements[i], start, breakTarget);
                return start;
            }

            if (statement.guard && statement.thenBranch) {
                const condition = addNode(
                    `if (${expressionText(statement.guard)})`,
                    "decision",
                    statement.range
                );
                const thenStart = buildStatement(statement.thenBranch, next, breakTarget);
                const elseStart = statement.elseBranch
                    ? buildStatement(statement.elseBranch, next, breakTarget)
                    : next;
                addEdge(condition, thenStart, "true");
                addEdge(condition, elseStart, "false");
                return condition;
            }

            if (statement.guard && statement.body) {
                const condition = addNode(
                    `while (${expressionText(statement.guard)})`,
                    "decision",
                    statement.range
                );
                const bodyStart = buildStatement(statement.body, condition, next);
                addEdge(condition, bodyStart, "true");
                addEdge(condition, next, "false");
                return condition;
            }

            const text = sourceText(statement.range).trim() || "statement";
            if (/^return\b/.test(text)) {
                const node = addNode(text, "statement", statement.range);
                addEdge(node, exit);
                return node;
            }
            if (/^break\b/.test(text)) {
                const node = addNode(text, "statement", statement.range);
                addEdge(node, breakTarget ?? exit);
                return node;
            }

            const node = addNode(text, "statement", statement.range);
            addEdge(node, next);
            return node;
        }

        const bodyStart = buildStatement(body, exit, exit);
        addEdge(entry, bodyStart);
        return {nodes, edges, entry, exit};
    }

    function escapeDot(text) {
        return String(text).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, "\\n");
    }

    function findReachableNodes(edges, entry) {
        const reachable = new Set([entry]);
        const pending = [entry];
        while (pending.length) {
            const current = pending.pop();
            edges.forEach(edge => {
                if (edge.from === current && !reachable.has(edge.to)) {
                    reachable.add(edge.to);
                    pending.push(edge.to);
                }
            });
        }
        return reachable;
    }

    function highlightActiveNode(svg, nodes, entryId) {
        svg.querySelectorAll(".cfg-active").forEach(node => node.classList.remove("cfg-active"));
        if (activeEntry) {
            svg.querySelector(`[id="cfg-node-${entryId}"]`)?.classList.add("cfg-active");
            return;
        }
        if (!activeRange)
            return;

        const matchingNodes = nodes.filter(node => node.range &&
            node.range.start <= activeRange.start && node.range.end >= activeRange.end);
        const selected = matchingNodes.sort((a, b) =>
            a.range.length - b.range.length
        )[0];
        if (selected)
            svg.querySelector(`[id="cfg-node-${selected.id}"]`)?.classList.add("cfg-active");
    }

    function setNodeTooltips(svg, nodes, reachable) {
        nodes.forEach(node => {
            const group = svg.querySelector(`[id="cfg-node-${node.id}"]`);
            if (!group)
                return;
            const title = group.querySelector("title");
            if (node.kind !== "terminal" && !reachable.has(node.id)) {
                if (title)
                    title.textContent = "Unreachable code";
                else {
                    const tooltip = document.createElementNS("http://www.w3.org/2000/svg", "title");
                    tooltip.textContent = "Unreachable code";
                    group.prepend(tooltip);
                }
            } else {
                title?.remove();
            }
        });
    }

    function selectNodeSource(node) {
        if (!node.range)
            return;
        const sourceLength = editor.editor.getValue().length;
        if (node.range.start < 0 || node.range.end > sourceLength)
            return;

        const document = editor.editor.session.doc;
        editor.editor.selection.setRange({
            start: document.indexToPosition(node.range.start),
            end: document.indexToPosition(node.range.end)
        });
        editor.editor.focus();
    }

    function renderGraph(body, message, entryLabel) {
        const sequence = ++renderSequence;
        const {nodes, edges, entry, exit} = buildGraph(body, entryLabel);
        const reachable = findReachableNodes(edges, entry);
        renderedNodes = nodes;
        renderedEntryId = entry;
        const lines = [
            "digraph ControlFlow {",
            '  graph [rankdir=TB, ranksep=0.25, nodesep=0.3, splines=polyline, bgcolor="transparent"];',
            '  node [fontname="Arial", fontsize=10, height=0.25, margin="0.06,0.005", style=filled, color="#8da1b3", fillcolor="#f5f9fc"];',
            '  edge [fontname="Arial", fontsize=8, color="#718494", fontcolor="#526879", arrowsize=0.7, labeldistance=1.5, labelangle=25];'
        ];
        nodes.forEach(node => {
            const shape = node.kind === "terminal" ? "oval" : "box";
            const fill = node.kind === "terminal" ? "#e8f4eb" :
                node.kind === "decision" ? "#fff8df" : "#f5f9fc";
            const deadCode = node.kind !== "terminal" && !reachable.has(node.id);
            const deadStyle = deadCode
                ? ', color="#b8b8b8", fillcolor="#e5e5e5", fontcolor="#888888"'
                : "";
            lines.push(`  n${node.id} [id="cfg-node-${node.id}", label="${escapeDot(node.text)}", shape=${shape}, fillcolor="${fill}"${deadStyle}];`);
        });
        lines.push(`  { rank=source; n${entry}; }`);
        lines.push(`  { rank=sink; n${exit}; }`);
        edges.forEach(edge => {
            const label = edge.label
                ? ` [label="  ${escapeDot(edge.label)}  "${edge.label === "false" ? ", style=dashed" : ""}]`
                : "";
            lines.push(`  n${edge.from} -> n${edge.to}${label};`);
        });
        lines.push("}");
        graph.textContent = "Rendering control-flow graph...";

        if (typeof Viz !== "function") {
            graph.textContent = "Graphviz failed to load; check the network connection and reload.";
            console.error("Control-flow graph requires Viz.js and its full.render.js renderer.");
            return;
        }

        viz ??= new Viz();
        viz.renderSVGElement(lines.join("\n"))
            .then(svg => {
                if (sequence !== renderSequence)
                    return;
                svg.classList.add("control-flow-svg");
                graph.replaceChildren();
                if (message) {
                    const status = document.createElement("div");
                    status.className = "control-flow-message";
                    status.textContent = message;
                    graph.append(status);
                }
                graph.append(svg);
                setNodeTooltips(svg, nodes, reachable);
                nodes.forEach(node => {
                    if (!node.range)
                        return;
                    const group = svg.querySelector(`[id="cfg-node-${node.id}"]`);
                    if (!group)
                        return;
                    group.style.cursor = "pointer";
                    group.addEventListener("click", () => selectNodeSource(node));
                });
                highlightActiveNode(svg, nodes, entry);
            })
            .catch(error => {
                if (sequence !== renderSequence)
                    return;
                graph.textContent = "Unable to render the control-flow graph.";
                console.error("Control-flow graph rendering failed:", error);
            });
    }

    function update() {
        graph.replaceChildren();
        select.replaceChildren();
        toolbar.hidden = false;
        if (!compilation || compilation.errors.length || !compilation.program) {
            const option = document.createElement("option");
            option.textContent = "(script)";
            select.append(option);
            renderGraph(
                {statements: []},
                compilation
                    ? "Fix the compilation error to display the control-flow graph."
                    : "Waiting for compilation."
            );
            return;
        }

        const bodies = getBodies(compilation.program);
        if (!bodies.length) {
            const option = document.createElement("option");
            option.textContent = "(no executable code)";
            select.append(option);
            renderGraph({statements: []}, "No executable code.");
            return;
        }

        selectedIndex = Math.min(selectedIndex, bodies.length - 1);
        toolbar.hidden = bodies.length === 1;
        bodies.forEach((_, index) => addOption(bodies, index));
        select.value = String(selectedIndex);
        renderGraph(bodies[selectedIndex].body, undefined, bodies[selectedIndex].entryLabel);
    }

    select.addEventListener("change", () => {
        selectedIndex = Number(select.value);
        update();
    });

    editor.compilationListeners.push(result => {
        compilation = result;
        selectedIndex = 0;
        activeRange = undefined;
        activeEntry = false;
        update();
    });

    editor.editor.session.on("change", () => {
        compilation = undefined;
        activeRange = undefined;
        activeEntry = false;
        update();
        window.setTimeout(() => editor.checkCompilation(), 200);
    });

    editor.stepListeners.push((trace, index) => {
        activeRange = trace[index]?.range;
        activeEntry = index === 0;
        const svg = graph.querySelector("svg");
        if (svg)
            highlightActiveNode(svg, renderedNodes, renderedEntryId);
    });

    editor.checkCompilation();
    return root;
}
