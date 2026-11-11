const cells = document.getElementById("cells");
const titleInput = document.getElementById("notebook-title");
const status = document.getElementById("status");
const emptyNotebook = document.getElementById("empty-notebook");
const outputViews = ["result", "console", "callstack"];
const readOnly = new URLSearchParams(window.location.search).get("readonly") === "true";
let draggedCell = null;

document.body.classList.toggle("readonly-mode", readOnly);

function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function addCellToolbar(cell, kind) {
    const toolbar = document.createElement("div");
    toolbar.className = "cell-toolbar";
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "cell-action cell-drag-handle";
    dragHandle.innerHTML = '<i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>';
    dragHandle.title = "Drag to move cell";
    dragHandle.setAttribute("aria-label", `Drag to move ${kind} cell`);
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", event => {
        event.stopPropagation();
        draggedCell = cell;
        cell.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-matte-cell", kind);
    });
    dragHandle.addEventListener("dragend", event => {
        event.stopPropagation();
        clearCellDragState();
    });
    cell.addEventListener("dragover", event => {
        if (!draggedCell || draggedCell === cell)
            return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        clearDropPosition(cell);
        const position = event.clientY < cell.getBoundingClientRect().top + cell.offsetHeight / 2
            ? "drop-before"
            : "drop-after";
        cell.classList.add(position);
    });
    cell.addEventListener("dragleave", event => {
        if (!(event.relatedTarget instanceof Node) || !cell.contains(event.relatedTarget))
            clearDropPosition(cell);
    });
    cell.addEventListener("drop", event => {
        if (!draggedCell || draggedCell === cell)
            return;
        event.preventDefault();
        const before = cell.classList.contains("drop-before");
        cell.parentElement.insertBefore(draggedCell, before ? cell : cell.nextSibling);
        clearCellDragState();
    });
    toolbar.append(dragHandle);
    // const label = document.createElement("span");
    // label.className = "cell-kind";
    // label.textContent = `${kind} cell`;
    // toolbar.append(label);



    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cell-action";
    remove.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    remove.setAttribute("aria-label", `Remove ${kind} cell`);
    remove.addEventListener("click", () => {
        cell.remove();
        updateEmptyNotebook();
    });
    toolbar.append(remove);

    const insert = document.createElement("details");
    insert.className = "insert-cell-menu";
    const insertButton = document.createElement("summary");
    insertButton.className = "cell-action";
    insertButton.title = `Add a cell below this ${kind} cell`;
    insertButton.setAttribute("aria-label", `Add a cell below this ${kind} cell`);
    insertButton.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    insert.append(insertButton);
    const insertOptions = document.createElement("div");
    insertOptions.className = "insert-cell-options";
    for (const [type, text] of [["markdown", "Markdown"], ["code", "Code"]]) {
        const option = document.createElement("button");
        option.type = "button";
        option.textContent = text;
        option.addEventListener("click", () => {
            if (type === "markdown")
                createMarkdownCell("", cell);
            else
                createCodeCell({}, cell);
            insert.open = false;
        });
        insertOptions.append(option);
    }
    insert.append(insertOptions);
    toolbar.append(insert);

    return toolbar;
}

function insertCell(cell, afterCell) {
    if (afterCell?.parentElement === cells)
        afterCell.after(cell);
    else
        cells.append(cell);
    updateEmptyNotebook();
}

function updateEmptyNotebook() {
    emptyNotebook.hidden = cells.childElementCount > 0;
}

function clearDropPosition(cell) {
    cell.classList.remove("drop-before", "drop-after");
}

function clearCellDragState() {
    draggedCell = null;
    cells.querySelectorAll(".cell").forEach(cell => {
        cell.classList.remove("is-dragging");
        clearDropPosition(cell);
    });
}

function renderMarkdown(text, preview) {
    preview.innerHTML = DOMPurify.sanitize(marked.parse(text));
}

function createMarkdownCell(content = "", afterCell = null) {
    const cell = document.createElement("article");
    cell.className = "cell";
    cell.dataset.type = "markdown";
    const toolbar = addCellToolbar(cell, "Markdown");

    const input = document.createElement("textarea");
    input.className = "markdown-input";
    input.setAttribute("aria-label", "Markdown cell content");
    input.value = content;
    const preview = document.createElement("div");
    preview.className = "markdown-preview";
    input.addEventListener("input", () => renderMarkdown(input.value, preview));
    renderMarkdown(input.value, preview);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cell-action";
    toggle.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    toggle.setAttribute("aria-label", "Edit markdown cell");
    toggle.setAttribute("aria-pressed", "true");
    toggle.addEventListener("click", () => {
        const editing = input.hidden;
        input.hidden = !editing;
        toggle.innerHTML = editing
            ? '<i class="fa-solid fa-eye" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
        toggle.setAttribute("aria-label", `${editing ? "View" : "Edit"} markdown cell`);
        toggle.setAttribute("aria-pressed", editing.toString());
        if (!editing)
            renderMarkdown(input.value, preview);
    });
    toolbar.insertBefore(toggle, toolbar.lastChild);
    input.hidden = true;
    cell.append(toolbar, input, preview);
    insertCell(cell, afterCell);
}

function createCodeCell(data = {}, afterCell = null) {
    const cell = document.createElement("article");
    cell.className = "cell";
    cell.dataset.type = "code";
    const toolbar = addCellToolbar(cell, "Java");

    const outputOptions = document.createElement("fieldset");
    outputOptions.className = "output-options";
    const legend = document.createElement("legend");
    legend.textContent = "Output:";
    outputOptions.append(legend);
    let initialOutputs = Array.isArray(data.outputs)
        ? data.outputs
        : typeof data.output === "string"
            ? data.output.split("+")
            : ["result"];
    if (initialOutputs.includes("none"))
        initialOutputs = [];
    for (const view of outputViews) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = view;
        checkbox.checked = initialOutputs.includes(view);
        const text = document.createElement("span");
        text.textContent = view;
        label.append(checkbox, text);
        outputOptions.append(label);
    }
    toolbar.insertBefore(outputOptions, toolbar.lastChild);

    const codeHost = document.createElement("div");
    codeHost.className = "code-host";
    const createWidget = (code, call, selectedOutputs) => {
        const nextWidget = document.createElement("matte-ace");
        if (call)
            nextWidget.setAttribute("call", call);
        if (selectedOutputs.includes("console"))
            nextWidget.setAttribute("sysout", "");
        if (selectedOutputs.includes("callstack"))
            nextWidget.setAttribute("callstack", "");
        nextWidget.textContent = code;
        return nextWidget;
    };
    const getSelectedOutputs = () =>
        Array.from(outputOptions.querySelectorAll('input[type="checkbox"]:checked'), checkbox => checkbox.value);
    let widget = createWidget(
        typeof data.code === "string" ? data.code : "",
        typeof data.call === "string" ? data.call : "",
        getSelectedOutputs()
    );
    codeHost.append(widget);
    cell.append(toolbar, codeHost);

    outputOptions.addEventListener("change", event => {
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox")
            return;
        const code = widget.editor?.editor.getValue() ?? widget.textContent;
        const call = widget.editor?.callBox.value ?? "";
        const selectedOutputs = getSelectedOutputs();
        const currentExtensions = ["console", "callstack"].filter(view =>
            widget.hasAttribute(view === "console" ? "sysout" : view)
        );
        const nextExtensions = selectedOutputs.filter(view => view !== "result");
        if (currentExtensions.join(",") !== nextExtensions.join(",")) {
            const nextWidget = createWidget(code, call, selectedOutputs);
            widget.replaceWith(nextWidget);
            widget = nextWidget;
        }
        if (widget.editor?.resultLabel)
            widget.editor.resultLabel.hidden = !selectedOutputs.includes("result");
    });
    insertCell(cell, afterCell);
    if (widget.editor?.resultLabel)
        widget.editor.resultLabel.hidden = !getSelectedOutputs().includes("result");
}

function loadNotebook(notebook) {
    if (!notebook || !Array.isArray(notebook.cells))
        throw new Error("Notebook JSON must contain a cells array.");
    for (const cell of notebook.cells) {
        if (cell?.type !== "markdown" && cell?.type !== "code")
            throw new Error(`Unsupported notebook cell type: ${String(cell?.type)}`);
    }
    titleInput.value = typeof notebook.title === "string" ? notebook.title : "Untitled notebook";
    cells.replaceChildren();
    for (const cell of notebook.cells) {
        if (cell?.type === "markdown")
            createMarkdownCell(typeof cell.content === "string" ? cell.content : "");
        else if (cell?.type === "code")
            createCodeCell(cell);
    }
    updateEmptyNotebook();
    showStatus(`Loaded ${notebook.cells.length} cell${notebook.cells.length === 1 ? "" : "s"}.`);
}

function serializeNotebook() {
    return {
        title: titleInput.value.trim() || "Untitled notebook",
        cells: Array.from(cells.children, cell => {
            if (cell.dataset.type === "markdown")
                return {type: "markdown", content: cell.querySelector(".markdown-input").value};
            const widget = cell.querySelector("matte-ace");
            return {
                type: "code",
                code: widget.editor?.editor.getValue() ?? widget.textContent,
                call: widget.editor?.callBox.value ?? "",
                outputs: Array.from(cell.querySelectorAll('.output-options input:checked'), checkbox => checkbox.value)
            };
        })
    };
}

async function loadFromUrl() {
    const sourceUrl = new URLSearchParams(window.location.search).get("url");
    if (!sourceUrl) {
        showStatus('Start with an empty notebook or open this page with ?url=notebook.example.json.');
        return;
    }
    try {
        const notebookUrl = new URL(sourceUrl, window.location.href);
        const response = await fetch(notebookUrl);
        if (!response.ok)
            throw new Error(`Request failed (${response.status} ${response.statusText}).`);
        loadNotebook(await response.json());
    } catch (error) {
        const advice = window.location.protocol === "file:"
            ? " Open the page from a local web server (for example, run `python3 -m http.server` in the project folder), or use Load JSON to choose the file."
            : " Make sure the JSON URL is on this site, or that its server allows cross-origin requests. You can also use Load JSON to choose a local file.";
        showStatus(`Could not load notebook: ${error.message}.${advice}`, true);
    }
}

document.getElementById("add-markdown").addEventListener("click", () => createMarkdownCell());
document.getElementById("add-code").addEventListener("click", () => createCodeCell());
document.getElementById("empty-add-markdown").addEventListener("click", () => {
    createMarkdownCell();
    emptyNotebook.open = false;
});
document.getElementById("empty-add-code").addEventListener("click", () => {
    createCodeCell();
    emptyNotebook.open = false;
});
const notebookFileInput = document.getElementById("notebook-file");
document.getElementById("load-notebook").addEventListener("click", () => notebookFileInput.click());
notebookFileInput.addEventListener("change", async () => {
    const file = notebookFileInput.files?.[0];
    if (!file)
        return;
    try {
        loadNotebook(JSON.parse(await file.text()));
        showStatus(`Loaded "${file.name}".`);
    } catch (error) {
        showStatus(`Could not load notebook: ${error.message}`, true);
    } finally {
        notebookFileInput.value = "";
    }
});
document.getElementById("save-notebook").addEventListener("click", () => {
    const json = JSON.stringify(serializeNotebook(), null, 2);
    const url = URL.createObjectURL(new Blob([json], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${titleInput.value.trim().replace(/[^a-z0-9-_]+/gi, "-") || "notebook"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("Notebook saved as a JSON file.");
});

loadFromUrl();
