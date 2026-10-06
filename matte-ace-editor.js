import {TraceEntry} from "./src/Interpreter.ts";
import {countTraceEntries, flatTrace, last, lastTrace} from "./src/utils.ts";

const {Range} = ace.require("ace/range");

export default class MatteAceEditor {
    constructor(container, width, height) {
        this.container = container;
        this.container.style.border = "1px solid #d0d0d0";
        this.container.style.borderRadius = "6px";
        this.container.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
        this.container.style.overflow = "hidden";
        this.container.style.width = (width ? width + "px" : "100%");
        // If height is null/undefined => enable auto height adapting to content lines
        this.autoHeight = (height == null);
        if (!this.autoHeight) {
            this.container.style.height = (height) + "px";
        } else {
            // set a small minimum while we compute the real height
            this.container.style.height = "50px";
        }
        this.container.style.display = "block"
        this.editor = ace.edit(this.container);
        this.editor.setTheme("ace/theme/textmate");
        this.editor.session.setMode("ace/mode/java");
        this.editor.setFontSize(20);
        this.editor.renderer.setShowGutter(true);
        this.editor.setOption('showLineNumbers', false); // TODO does not work
        this.editor.session.setNewLineMode("unix");
        this.editor.setOptions({
            highlightSelectedWord: false
        });
        this.editor.setHighlightActiveLine(false);

        this.init();

        //this.addInspector();
        this.result = null;
        this.popups = [];
        this.extensions = {};
        this.beforeRunListeners = [];
        this.afterRunListeners = [];
        this.stepListeners = [];
    }

    secondaryMarkers = [];

    clearSecondaryMarkers() {
        this.secondaryMarkers.forEach(m => {
            this.editor.session.removeMarker(m);
        })
        this.secondaryMarkers = []
    }

    init() {
        this.editor.selection.on("changeCursor", () => {
            this.popups.forEach(p => p.hide())
            this.clearSecondaryMarkers()
            if (this.result == null)
                return;
            const err = this.result.error ? this.result.error : lastTrace(this.result.trace).error;
            const index = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
            if (err && index >= err.range.start && index <= err.range.end) {
                let message = err.message.replace(/'(.*?)'/g, '<i>$1</i>');

                if (err.detail) {
                    if (err.detail.related) {
                        err.detail.related.forEach(r => {
                            this.secondaryMarkers.push(this.editor.session.addMarker(
                                this.range2Ace(r),
                                "error-secondary",
                                "text"
                            ))
                        })
                    }
                    if (err.detail.hint)
                        message += "\n<i>" + err.detail.hint + "</i>"

                }
                // this.popups.forEach(p => p.hide())
                this.popup(err.range.start, message, true);
            }

            // else {
            //     this.popups.forEach(p => p.hide())
            //     if(this.secondaryMarker) {
            //         this.editor.session.removeMarker(this.secondaryMarker);
            //         this.secondaryMarker = undefined
            //     }
            // }

        });
        // TODO bug creates several when there are multiple editors
        const styles = [
            `
            .ace_error-squiggle {
    position: absolute;
    /* Increased height to 6px and stroke-width to 1.5 for better visibility */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6'%3E%3Cpath d='M0 5c1 0 2-3 4-3s3 3 4 3' fill='none' stroke='%23ff3333' stroke-width='1.5'/%3E%3C/svg%3E");
    background-repeat: repeat-x;
    background-position: bottom;
    z-index: 20;
    /* Optional: add a slight vertical offset if it's too close to the text */
    margin-bottom: 1px;
}`,
            `.error-highlight {
            position: absolute;
            background-color: rgba(255, 0, 0, 0.3);
            border-bottom: 2px wavy red;
            z-index: 20;
        }`,
            `.error-secondary {
            position: absolute;
            background-color: rgba(255, 255, 0, 1.0);
            border-bottom: 2px wavy red;
            z-index: 20;
        }`,
            `.ace_tooltip {
            background:  rgba(235, 235, 235, 1);
            color: rgba(128, 128, 128, 1);
            border: 1px solid #111111;
            border-radius: 4px;
            padding: 3px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 10pt !important;
            ///box-shadow: 1px 1px 5px rgba(0,0,0,0.5);
            white-space: pre-wrap;
        }`
            ,
            `.ace_tooltip_exp {
            background:  rgba(181, 213, 255, 1);
            color: rgba(128, 128, 128, 1);
            border: 1px solid #111111;
            border-radius: 0px;
            padding: 3px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 10pt !important;
            ///box-shadow: 1px 1px 5px rgba(0,0,0,0.5);
            white-space: pre-wrap;
        }`,
            `

        .my-error-tooltip b {
            color: #ff5555; /* Make the bold part bright red */
            font-weight: bold;
        }
        .my-error-tooltip i {
            color: #ffb86c; /* Make the italic part orange */
            font-weight: bold;
        }`
        ];

        styles.forEach(s => {
            const style = document.createElement('style');
            style.textContent = s;
            document.head.appendChild(style);
        })

        // If autoHeight is enabled, watch for content changes and adjust height
        if (this.autoHeight) {
            // debounced resize to avoid thrashing while typing
            this._resizeTimeout = null;
            const scheduleAdjust = () => {
                if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
                this._resizeTimeout = setTimeout(() => this.adjustHeight(), 100);
            };

            // initial adjust after renderer is ready
            setTimeout(() => this.adjustHeight(), 0);

            // Adjust when session content changes (typing, paste, etc.)
            this.editor.session.on('change', scheduleAdjust);
            // Also adjust if editor configuration or renderer updates line heights
            this.editor.on('change', scheduleAdjust);
        }
    }

    // Adjust container height based on the number of visible (screen) lines
    adjustHeight() {
        if (!this.autoHeight) return;
        try {
            const session = this.editor.session;
            // screen length accounts for wrapped lines
            const lines = (typeof session.getScreenLength === 'function') ? session.getScreenLength() : session.getLength();
            const lineHeight = (this.editor.renderer && this.editor.renderer.lineHeight) ? this.editor.renderer.lineHeight : 20;
            const padding = 8; // small padding for aesthetics
            const maxHeight = 1200; // avoid growing unbounded
            const minHeight = 50;
            let newHeight = Math.max(minHeight, Math.ceil(lines * lineHeight) + padding);
            if (newHeight > maxHeight) newHeight = maxHeight;
            this.container.style.height = newHeight + 'px';
            // inform ace to resize properly
            if (typeof this.editor.resize === 'function') this.editor.resize();
        } catch (e) {
            // be defensive: don't break editor if renderer not ready
            // will try again next change
        }
    }

    // addInspector() {
    //     const jlk = this;
    //     this.editor.selection.on('changeSelection', ()=> {
    //         var range = this.editor.getSelectionRange()
    //         let log = this.result.trace.filter(t => t.range.line === range.start.row + 1).map(t => t.materialization);
    //         if (log.length > 0) {
    //             this.popup(0, log.join("\n"));
    //         }
    //     });
    // }

    addCallBox(call) {
        this.runBox = document.createElement('div');
        this.runBox.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";

        this.container.after(this.runBox);

        this.runBtn = document.createElement('button');
        this.runBtn.innerHTML = "▶";
        this.runBtn.style = "cursor: pointer; border: solid 1px; padding: 2px 10px; border-radius: 3px; font-weight: bold;";
        this.runBtn.onclick = () => {
            this.runParser();
            this.resultLabel.style.visibility = "visible";
        }
        this.runBox.append(this.runBtn);

        this.callBox = document.createElement('input');
        this.callBox.type = "text";
        this.callBox.value = call == null ? "" : call;
        this.callBox.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.runParser();
            }
        });
        this.runBtn.after(this.callBox)

        this.resultLabel = document.createElement('span');
        this.callBox.after(this.resultLabel);
        this.editor.session.on('change', () => {
            this.resultLabel.textContent = '';
            this.resultLabel.style.visibility = "visible";
        });

        this.debugBtn = document.createElement('button');
        this.debugBtn.innerHTML = "Debug";
        this.debugBtn.onclick = () => {
            this.slider.hidden = false;
            this.backBtn.hidden = false;
            this.forwardBtn.hidden = false;
            this.closeDebugBtn.hidden = false;
            this.debugBtn.hidden = true;
            this.cumulative.hidden = true;
            this.updateDebugNavigation();
            this.editor.setReadOnly(true); // TODO check dirty
            this.step(0, this.cumulative.checked);
            this.resultLabel.style.visibility = "hidden";
        }
        this.debugBtn.hidden = true;
        this.resultLabel.after(this.debugBtn);

        this.slider = document.createElement('input');
        this.slider.type = "range";
        this.slider.min = "0";
        this.slider.value = "0";
        this.slider.hidden = true;
        this.slider.addEventListener('input', (e) => {
            const index = Number(e.target.value);
            this.step(index, this.cumulative.checked);
            this.updateDebugNavigation();
        });
        // this.slider.addEventListener('focusout', () => {
        //     this.popups.forEach(p => p.hide());
        //     this.slider.hidden = true;
        //     this.debugBtn.hidden = false;
        //     this.cumulative.hidden = false;
        // });
        this.debugBtn.after(this.slider);

        this.backBtn = document.createElement('button');
        this.backBtn.innerHTML = "←";
        this.backBtn.title = "Back";
        this.backBtn.setAttribute("aria-label", "Back");
        this.backBtn.hidden = true;
        this.backBtn.onclick = () => this.moveSlider(-1);
        this.slider.after(this.backBtn);

        this.forwardBtn = document.createElement('button');
        this.forwardBtn.innerHTML = "→";
        this.forwardBtn.title = "Forward";
        this.forwardBtn.setAttribute("aria-label", "Forward");
        this.forwardBtn.hidden = true;
        this.forwardBtn.onclick = () => this.moveSlider(1);
        this.backBtn.after(this.forwardBtn);

        this.closeDebugBtn = document.createElement('button');
        this.closeDebugBtn.innerHTML = "×";
        this.closeDebugBtn.title = "Close";
        this.closeDebugBtn.setAttribute("aria-label", "Close");
        this.closeDebugBtn.hidden = true;
        this.closeDebugBtn.onclick = () => {
            this.popups.forEach(p => p.hide());
            this.slider.hidden = true;
            this.backBtn.hidden = true;
            this.forwardBtn.hidden = true;
            this.closeDebugBtn.hidden = true;
            this.debugBtn.hidden = false;
            this.cumulative.hidden = false;
            this.editor.setReadOnly(false);
            this.resultLabel.style.visibility = "visible";
        };
        this.forwardBtn.after(this.closeDebugBtn);

        this.cumulative = document.createElement('input');
        this.cumulative.type = 'checkbox';
        this.cumulative.hidden = true;
        this.closeDebugBtn.after(this.cumulative);
    }

    moveSlider(delta) {
        const index = Math.max(
            Number(this.slider.min),
            Math.min(Number(this.slider.value) + delta, Number(this.slider.max))
        );
        this.slider.value = index.toString();
        this.step(index, this.cumulative.checked);
        this.updateDebugNavigation();
    }

    updateDebugNavigation() {
        const index = Number(this.slider.value);
        this.backBtn.disabled = index <= Number(this.slider.min);
        this.forwardBtn.disabled = index >= Number(this.slider.max);
    }

    runParser() {
        this.beforeRunListeners.forEach(l => l());
        const code = this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include)
        this.result = window.matte(code, this.callBox.value === "" ? null : this.callBox.value, this.extensions);
        this.clearErrorMarkers();
        this.editor.session.clearAnnotations();
        console.log(this.result)

        if (this.result.error) {
            const e = this.result.error
            this.editor.session.addMarker(
                this.range2Ace(e.range),
                "ace_error-squiggle",
                "text"
            );
            this.editor.session.setAnnotations([{
                row: e.range.line - 1, // 0-index
                column: 0,
                text: e.error,
                type: "error" // Options: "error", "warning", or "info"
            }]);
        } else {
            this.trace = flatTrace(this.result.trace)
            const lastEntry = last(this.trace)
            if (lastEntry.error) { // run-time error
                this.editor.session.addMarker(
                    this.range2Ace(lastEntry.range),
                    "error-highlight",
                    "text"
                );
                this.slider.max = Math.max(0, this.trace.length - 1).toString();
                this.slider.value = this.slider.max;
                this.debugBtn.hidden = true;
                this.slider.hidden = false;
                this.backBtn.hidden = false;
                this.forwardBtn.hidden = false;
                this.closeDebugBtn.hidden = false;
                this.cumulative.hidden = false;
                this.updateDebugNavigation();
            } else {
                this.resultLabel.innerHTML = '';
                // TODO handle void
                // TODO handle script (show var state)
                if (this.result.result !== undefined)
                    this.resultLabel.innerHTML = ' = ' + JSON.stringify(this.result.result.evaluation);
                this.slider.max = Math.max(0, this.trace.length - 1).toString();
                this.slider.value = "0";
                this.debugBtn.hidden = false;
                this.cumulative.hidden = false;
                this.slider.hidden = true;
                this.backBtn.hidden = true;
                this.forwardBtn.hidden = true;
                this.closeDebugBtn.hidden = true;
            }
            this.afterRunListeners.forEach(l => l(this.result));
        }
    }

    popup(offset, message, top, exp) {
        const Tooltip = ace.require("ace/tooltip").Tooltip;
        const tip = new Tooltip(this.editor.container);
        tip.getElement().classList.add(exp ? "ace_tooltip_exp" : "ace_tooltip");
        const pos = this.editor.session.doc.indexToPosition(offset);
        const y = pos.row;
        const x = top ? pos.column - 1 : this.editor.session.getLine(pos.row).length; // end of line
        const canvasPos = this.editor.renderer.textToScreenCoordinates(y, x);
        if (top)
            canvasPos.pageY -= 25 * (1 + (message.split('\n').length - 1));
        else
            canvasPos.pageX += 10;
        this.popups.push(tip);
        tip.setClassName("my-error-tooltip");
        tip.setHtml(message);
        tip.setPosition(canvasPos.pageX, canvasPos.pageY)
        tip.show()
        //tip.show(message, canvasPos.pageX, canvasPos.pageY);
    }

    range2Ace(range) {
        const startPos = this.editor.session.doc.indexToPosition(range.start);
        const endPos = this.editor.session.doc.indexToPosition(range.end);
        return new Range(startPos.row, startPos.column, endPos.row, endPos.column);
    }

    oneStep() {
        const current = parseInt(this.slider.value, 10);
        this.step(current + 1);
        this.slider.value = (current + 1).toString();
    }

    pretty(mat) {
        return mat
            .replaceAll("&&", "∧")
            .replaceAll("||", "∨")
            .replaceAll("!=", "≠")
            .replaceAll("!", "¬")
            .replaceAll("<=", "≤")
            .replaceAll(">=", "≥")
    }

    step(index, cumulative = false) {
        const lastIndex = this.trace.length - 1;
        if (index >= 0 && index <= lastIndex) {
            const t = this.trace[index];
            if (t.range)
                this.editor.revealRange(this.range2Ace(t.range));
            this.popups.forEach(p => p.hide());
            if (t.stack.variables)
                this.createScopePopups(t.stack.variables);

            let prevText = "";
            if (cumulative) {
                const prev = this.trace.filter((prev, i) => i < index && prev.range.start === t.range.start);
                prevText = prev.map(p => {
                    const mat = p.materialization ? " (" + this.pretty(p.materialization) + ")" : "";
                    return this.prettyPrint(p.evaluation) + mat
                }).join("\n")
                if (prevText.length > 0)
                    prevText += "\n";
            }


            if (t.evaluation != null) {
                const mat = t.materialization !== t.evaluation.toString() ? t.materialization ? " (" + this.pretty(t.materialization) + ")" : "" : "";
                this.popup(t.range.start, prevText + this.prettyPrint(t.evaluation) + mat, t.isCall, true);
            }
            this.stepListeners.forEach(l => l(this.trace, index));
            this.slider.focus();
            this.resultLabel.style.visibility = "hidden";
        } else {
            const lastRange = this.range2Ace(this.trace[lastIndex]);
            this.editor.gotoLine(lastRange.end.row + 1, 1);
            this.stepListeners.forEach(l => l(this.trace, lastIndex));
            this.resultLabel.style.visibility = "visible";
        }
    }

    clearErrorMarkers() {
        const session = this.editor.getSession();
        const markers = session.getMarkers();

        for (const id in markers) {
            if (markers[id].clazz === "ace_error-squiggle" || markers[id].clazz === "error-highlight") {
                session.removeMarker(id);
            }
        }
    }

    showStack(dataMap, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = ""; // Clear existing table

        const table = document.createElement('table');
        const thead = table.createTHead();
        const tbody = table.createTBody();
        const headerRow = thead.insertRow();

        // 1. Create Headers from Map Keys
        const keys = Array.from(dataMap.keys());
        keys.forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            headerRow.appendChild(th);
        });

        // 2. Find the maximum number of rows needed
        const rowCount = Math.max(...keys.map(key => dataMap.get(key).length));

        // 3. Create Rows (Row-major order)
        for (let i = 0; i < rowCount; i++) {
            const row = tbody.insertRow();
            keys.forEach(key => {
                const cell = row.insertCell();
                const columnData = dataMap.get(key);
                // Handle cases where some columns might be shorter than others
                cell.textContent = columnData[i] !== undefined ? columnData[i] : "";
            });
        }

        container.appendChild(table);
    }

    createVerticalTable(dataMap, container) {
        //const container = document.getElementById(containerId);
        // if(!container) {
        //     console.error("no contained named '" + containerId + "' found for creating a table therein.")
        //     return;
        // }

        container.innerHTML = ""; // Clear existing content

        const table = document.createElement('table');
        const tbody = table.createTBody();

        // Iterate directly over the Map entries [key, value]
        for (const [key, value] of dataMap) {
            const row = tbody.insertRow();

            // Create the Header Cell (Key)
            const th = document.createElement('th');
            th.textContent = key;
            th.style.textAlign = "left"; // Keep labels aligned
            row.appendChild(th);

            // Create the Data Cell (Value)
            const td = row.insertCell();
            td.textContent = value.evaluation;
        }

        container.appendChild(table);
    }

    createScopePopups(dataMap) {
        if (dataMap === undefined)
            return

        for (const [key, value] of dataMap) {
            const mat = value.materialization === value.evaluation.toString() ? "" : value.materialization ? " (" + value.materialization + ")" : "";
            this.popup(value.declaration.end, this.prettyPrint(value.evaluation) + mat, value.isParameter, false);
        }
    }

    prettyPrint(value) {
        if (value === null || value === undefined)
            return "";
        else if (Array.isArray(value))
            return "[" + value.join(", ") + "]";
        else
            return value.toString();
    }

    addArrayWidget(row, dataArray) {
        let LineWidgets = ace.require("ace/line_widgets").LineWidgets;
        // 2. Create the HTML element
        var container = document.createElement("div");
        container.className = "ace-inline-array-widget";

        // Create the visual list
        var listHtml = dataArray.map(item => `<span>${item}</span>`).join('');
        container.innerHTML = `<div class="widget-label">Live Array:</div><div class="widget-items">${listHtml}</div>`;

        // 3. Define the widget object
        var widget = {
            row: row,             // The line number to attach to
            fixedWidth: true,     // Keeps it from jumping horizontally
            el: container,        // The DOM element
            type: "arrayWidget"
        };

        // 4. Initialize the widget manager if it doesn't exist
        if (!this.editor.session.widgetManager) {
            this.editor.session.widgetManager = new LineWidgets(this.editor.session);
        }

        // 5. Add the widget
        this.editor.session.widgetManager.addLineWidget(widget);
        return widget;
    }
}
