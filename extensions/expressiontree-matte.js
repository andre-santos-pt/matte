function expressiontree_matte(editor) {
    const root = document.createElement("div");
    root.className = "expression-tree";

    let expressions = [];
    let viz;
    let activeRange;
    let renderSequence = 0;
    let renderedNodes = [];

    function isOperation(expression) {
        if (!expression || typeof expression !== "object" || typeof expression.getChildren !== "function")
            return false;
        const children = expression.getChildren();
        return typeof expression.operator === "string" &&
            (children.length === 1 || children.length === 2);
    }

    function collectExpressions(node, visited = new WeakSet()) {
        if (!node || typeof node !== "object" || visited.has(node))
            return;
        visited.add(node);

        if (typeof node.getChildren === "function" && node.range) {
            if (isOperation(node))
                expressions.push(node);
            node.getChildren().forEach(child => collectExpressions(child, visited));
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(child => collectExpressions(child, visited));
            return;
        }

        Object.entries(node).forEach(([key, value]) => {
            if (key !== "parent" && key !== "type")
                collectExpressions(value, visited);
        });
    }

    function sourceText(range) {
        if (!range)
            return "";
        return range.text ?? editor.getValue().slice(range.start, range.end);
    }

    function escapeDot(text) {
        return String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    }

    function highlightActiveNode(svg, nodes) {
        svg.querySelectorAll(".expression-active").forEach(node => node.classList.remove("expression-active"));
        if (!activeRange)
            return;

        const matchingNodes = nodes.filter(node => node.range &&
            node.range.start <= activeRange.start && node.range.end >= activeRange.end);
        const selected = matchingNodes.sort((a, b) =>
            a.range.length - b.range.length
        )[0];
        if (selected)
            svg.querySelector(`[id="expression-node-${selected.id}"]`)?.classList.add("expression-active");
    }

    function buildGraph(expression) {
        const nodes = [];
        const edges = [];

        function addNode(text, kind, range) {
            const node = {id: nodes.length, text: text || "?", kind, range};
            nodes.push(node);
            return node;
        }

        function addOperation(node, parentId, parentLabel = "") {
            const range = node.range;
            const typeText = node.type != null ? `\n${String(node.type)}` : "";
            const graphNode = addNode(`${node.operator}${typeText}`, "operation", range);
            if (parentId != null)
                edges.push({from: parentId, to: graphNode.id, label: parentLabel});

            const children = node.getChildren();
            children.forEach((child, index) => {
                const label = children.length === 2 ? (index === 0 ? "left" : "right") : "operand";
                if (isOperation(child)) {
                    addOperation(child, graphNode.id, label);
                } else {
                    const childRange = child.range;
                    const value = sourceText(childRange) || "?";
                    const childType = child.type != null ? `\n${String(child.type)}` : "";
                    const operand = addNode(`${value}${childType}`, "operand", childRange);
                    edges.push({from: graphNode.id, to: operand.id, label});
                }
            });
            return graphNode;
        }

        addOperation(expression, null);
        return {nodes, edges};
    }

    function renderExpression(expression, message) {
        const sequence = ++renderSequence;
        root.replaceChildren();

        if (!expression) {
            const status = document.createElement("div");
            status.className = "expression-message";
            status.textContent = message || "Place the cursor in a unary or binary operation.";
            root.append(status);
            return;
        }

        const {nodes, edges} = buildGraph(expression);
        renderedNodes = nodes;
        const lines = [
            "digraph ExpressionTree {",
            '  graph [rankdir=TB, ranksep=0.35, nodesep=0.35, splines=polyline, bgcolor="transparent"];',
            '  node [fontname="Arial", fontsize=10, height=0.25, margin="0.08,0.02", style=filled, color="#8da1b3", fillcolor="#f5f9fc"];',
            '  edge [fontname="Arial", fontsize=8, color="#718494", fontcolor="#526879", arrowsize=0.7, labeldistance=1.5, labelangle=25];'
        ];
        nodes.forEach(node => {
            const shape = node.kind === "operand" ? "ellipse" : "box";
            const fill = node.kind === "operand" ? "#ffffff" : "#eef5fa";
            lines.push(`  n${node.id} [id="expression-node-${node.id}", label="${escapeDot(node.text)}", shape=${shape}, fillcolor="${fill}"];`);
        });
        edges.forEach(edge => {
            const label = edge.label
                ? ` [taillabel="${escapeDot(edge.label)}", labeldistance=2, labelangle=${edge.label === "left" ? 45 : -45}]`
                : "";
            lines.push(`  n${edge.from} -> n${edge.to}${label};`);
        });
        lines.push("}");

        root.textContent = "Rendering expression tree...";
        if (typeof Viz !== "function") {
            root.textContent = "Graphviz failed to load; check the network connection and reload.";
            console.error("Expression tree requires Viz.js and its full.render.js renderer.");
            return;
        }

        viz ??= new Viz();
        viz.renderSVGElement(lines.join("\n"))
            .then(svg => {
                if (sequence !== renderSequence)
                    return;
                svg.classList.add("expression-tree-svg");
                root.replaceChildren(svg);
                highlightActiveNode(svg, nodes);
            })
            .catch(error => {
                if (sequence !== renderSequence)
                    return;
                root.textContent = "Unable to render the expression tree.";
                console.error("Expression tree rendering failed:", error);
            });
    }

    function update() {
        const selection = editor.editor.getSelectionRange();
        const cursor = editor.editor.selection.isEmpty();
        const start = editor.editor.session.doc.positionToIndex(selection.start);
        const end = editor.editor.session.doc.positionToIndex(selection.end);
        const selected = expressions
            .filter(expression => expression.range &&
                (cursor
                    ? expression.range.start <= start && start <= expression.range.end
                    : expression.range.start <= start && expression.range.end >= end))
            .sort((a, b) => a.range.length - b.range.length)[0];

        activeRange = selected?.range;
        renderExpression(selected);
    }

    editor.compilationListeners.push(compilation => {
        expressions = [];
        if (!("type" in compilation))
            collectExpressions(compilation);
        update();
    });

    editor.editor.selection.on("changeCursor", update);
    editor.editor.selection.on("changeSelection", update);

    let compileTimeout;
    editor.editor.session.on("change", () => {
        expressions = [];
        activeRange = undefined;
        renderExpression(null, "Waiting for compilation.");
        window.clearTimeout(compileTimeout);
        compileTimeout = window.setTimeout(() => editor.checkCompilation(), 200);
    });

    editor.stepListeners?.push((trace, index) => {
        activeRange = trace[index]?.range;
        const svg = root.querySelector("svg");
        if (svg)
            highlightActiveNode(svg, renderedNodes);
    });

    editor.checkCompilation();
    return root;
}
