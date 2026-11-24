function expressiontypes_matte(editor) {
    let expressions = [];
    let activeExpression;
    let popup;

    function expressionChildren(node) {
        const children = new Set(typeof node.getChildren === "function" ? node.getChildren() : []);
        Object.entries(node).forEach(([key, value]) => {
            if (key === "parent")
                return;
            const values = Array.isArray(value) ? value : [value];
            values.forEach(child => {
                if (child && typeof child.getChildren === "function" && child.range)
                    children.add(child);
            });
        });
        return [...children];
    }

    function clearPopup() {
        if (popup) {
            popup.destroy();
            const index = editor.popups.indexOf(popup);
            if (index !== -1)
                editor.popups.splice(index, 1);
        }
        popup = undefined;
        activeExpression = undefined;
    }

    function collectExpressions(node, visited = new WeakSet()) {
        if (!node || typeof node !== "object" || visited.has(node))
            return;
        visited.add(node);

        if (typeof node.getChildren === "function" && node.range) {
            if (node.type != null)
                expressions.push(node);
            expressionChildren(node).forEach(child => collectExpressions(child, visited));
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

    function parenthesizedText(node) {
        const source = editor.editor.getValue();
        const start = node.range.start;
        const end = node.range.end;
        const children = expressionChildren(node)
            .filter(child => child.range && child.range.start >= start && child.range.end <= end)
            .sort((a, b) => a.range.start - b.range.start);
        let text = source.slice(start, end);
        let parenthesized = false;
        const isBinaryParent = typeof node.operator === "string" && children.length === 2;
        for (const child of children.slice().reverse()) {
            const childChildren = expressionChildren(child);
            const isBinaryChild = typeof child.operator === "string" && childChildren.length === 2;
            const isCastChild = child.castType != null && child.expression != null;
            const childResult = parenthesizedText(child);
            const needsParentheses = isBinaryParent && (isBinaryChild || isCastChild);
            const childText = needsParentheses
                ? `(${childResult.text})`
                : childResult.text;
            parenthesized ||= childResult.parenthesized || needsParentheses;
            text = text.slice(0, child.range.start - start) +
                childText +
                text.slice(child.range.end - start);
        }
        return {text, parenthesized};
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function showTypeForSelection() {
        const selection = editor.editor.getSelectionRange();
        if (editor.editor.selection.isEmpty()) {
            clearPopup();
            return;
        }
        const start = editor.editor.session.doc.positionToIndex(selection.start);
        const end = editor.editor.session.doc.positionToIndex(selection.end);
        const expression = expressions
            .find(candidate => candidate.range.start === start && candidate.range.end === end);

        if (expression === activeExpression && popup?.isOpen)
            return;

        clearPopup();
        if (!expression)
            return;

        const type = escapeHtml(expression.type);
        const expressionText = parenthesizedText(expression);
        const text = expressionText.parenthesized ? `<br>${escapeHtml(expressionText.text)}` : "";
        popup = editor.popup(expression.range.start, `<b>${type}</b>${text}`, true, "expression-type-popup");
        if (popup) {
            activeExpression = expression;
            const doc = editor.editor.session.doc;
            const start = doc.indexToPosition(expression.range.start);
            const end = doc.indexToPosition(expression.range.end);
            const startScreen = editor.editor.renderer.textToScreenCoordinates(start.row, start.column);
            const endScreen = editor.editor.renderer.textToScreenCoordinates(end.row, end.column);
            const left = start.row === end.row
                ? (startScreen.pageX + endScreen.pageX - popup.getWidth()) / 2
                : startScreen.pageX;
            popup.setPosition(left, startScreen.pageY - popup.getHeight() - 4);
        }
    }

    editor.compilationListeners.push(compilation => {
        clearPopup();
        expressions = [];
        if (!("type" in compilation))
            collectExpressions(compilation);
    });

    editor.editor.selection.on("changeCursor", showTypeForSelection);
    editor.editor.selection.on("changeSelection", showTypeForSelection);

    let compileTimeout;
    editor.editor.session.on("change", () => {
        clearPopup();
        expressions = [];
        window.clearTimeout(compileTimeout);
        compileTimeout = window.setTimeout(() => editor.checkCompilation(), 200);
    });
    editor.checkCompilation();
}
