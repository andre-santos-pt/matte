import {TraceEntry} from "./src/Interpreter.ts";
import {countTraceEntries, flatTrace, last, lastTrace} from "./src/utils.ts";

const {Range} = ace.require("ace/range");

const styleCss =
    `.ace_error-squiggle {
                position: absolute;
                /* Increased height to 6px and stroke-width to 1.5 for better visibility */
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6'%3E%3Cpath d='M0 5c1 0 2-3 4-3s3 3 4 3' fill='none' stroke='%23ff3333' stroke-width='1.5'/%3E%3C/svg%3E");
                background-repeat: repeat-x;
                background-position: bottom;
                z-index: 20;
                /* Optional: add a slight vertical offset if it's too close to the text */
                margin-bottom: 1px;
            }
            .error-highlight {
                position: absolute;
                background-color: rgba(255, 0, 0, 0.3);
                border-bottom: 2px wavy red;
                z-index: 20;
            }
            .error-secondary {
                position: absolute;
                background-color: rgba(255, 255, 0, 1.0);
                border-bottom: 2px wavy red;
                z-index: 20;
            }
            .ace_tooltip {
                background:  rgba(235, 235, 235, 1);
                color: rgba(128, 128, 128, 1);
                border: 1px solid #111111;
                border-radius: 4px;
                padding: 3px;
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 10pt !important;
                ///box-shadow: 1px 1px 5px rgba(0,0,0,0.5);
                white-space: pre-wrap;
            }
            .ace_tooltip_exp {
                background:  rgba(181, 213, 255, 1);
                color: rgba(128, 128, 128, 1);
                border: 1px solid #111111;
                border-radius: 0px;
                padding: 3px;
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 10pt !important;
                ///box-shadow: 1px 1px 5px rgba(0,0,0,0.5);
                white-space: pre-wrap;
            }
            .my-error-tooltip b {
                color: #ff5555; /* Make the bold part bright red */
                font-weight: bold;
            }
            .my-error-tooltip i {
                color: #ffb86c; /* Make the italic part orange */
                font-weight: bold;
            }`;

export default class MatteAceEditor {
    constructor(container, width, height) {
        this.container = container;
        this.container.style.marginTop = "25px";
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
        this.editorBackgroundColor = this.editor.container.querySelector('.ace_scroller').style.backgroundColor;
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

        this.result = null;
        this.popups = [];
        this.popupPositions = new WeakMap();
        this.repositionPopups = () => {
            this.popups.forEach(tip => {
                const position = this.popupPositions.get(tip);
                if (position)
                    this.positionPopup(tip, position.offset, position.message, position.top);
            });
        };
        window.addEventListener('scroll', this.repositionPopups, true);
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
                this.popup(err.range.start, message);
            }
        });


        if (!Array.from(document.head.querySelectorAll('style')).some(style => style.id === 'matte-ace-editor-style')) {
            const style = document.createElement('style');
            style.textContent = styleCss;
            style.id = 'matte-ace-editor-style';
            document.head.appendChild(style);
        }

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


    addCallBox(call) {
        this.runBox = document.createElement('div');
        this.runBox.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";

        this.container.after(this.runBox);

        this.runBtn = document.createElement('button');
        this.runBtn.innerHTML = "▶";
        this.runBtn.title = "Evaluate call";
        this.runBtn.style = "cursor: pointer; border: solid 1px; padding: 2px 10px; border-radius: 3px; font-weight: bold;";
        this.runBtn.onclick = () => {
            this.runParser();
        }
        this.runBox.append(this.runBtn);

        this.callBox = document.createElement('input');
        this.callBox.type = "text";
        this.callBox.title = "Write a call to a function or leave empty to run script";
        this.callBox.style = "margin-left: 10px; font-family: 'Monaco', 'Menlo', monospace; background-color: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 3px; padding: 2px 5px; width: 300px;";
        this.callBox.value = call == null ? "" : call;
        this.callBox.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.runParser();
            }
        });
        this.runBtn.after(this.callBox)

        this.resultLabel = document.createElement('span');
        this.resultLabel.title = "Result of the last evaluation";
        this.resultLabel.style = "font-family: monospace; font-weight: bold; margin-left: 10px;";
        this.callBox.after(this.resultLabel);
        this.callBox.addEventListener('input', () => {
            this.setDebugMode(false);
            this.resultLabel.style.visibility = "hidden";
            this.debugBtn.hidden = true;
        });
        this.cumulativeMode = false;
        this.editor.container.addEventListener('keydown', (event) => {
            if (!this.editor.getReadOnly() || event.key.length !== 1 ||
                event.ctrlKey || event.metaKey || event.altKey || event.isComposing)
                return;

            this.popups.forEach(p => p.hide());
            const cursorIndex = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
            this.popup(cursorIndex, "Read-only. Close the debug mode to edit the code.", true);
        }, true);
        this.editor.session.on('change', () => {
            this.resultLabel.textContent = '';
            this.resultLabel.style.visibility = "hidden";
            this.debugBtn.style.visibility = "hidden";
        });
        this.createDebugBox();
    }

    createDebugBox() {
        this.debugBox = document.createElement('div');
        this.debugBox.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";
        this.runBox.after(this.debugBox);

        this.debugBtn = document.createElement('button');
        this.debugBtn.innerHTML = "&#128269;";
        this.debugBtn.onclick = () => {
            this.setDebugMode(true)
        }
        this.debugBtn.hidden = true;
        this.debugBtn.title = "Debug the last call";
        this.debugBox.append(this.debugBtn);

        this.slider = document.createElement('input');
        this.slider.type = "range";
        this.slider.min = "0";
        this.slider.value = "0";
        this.slider.hidden = true;
        this.slider.addEventListener('input', (e) => {
            const index = Number(e.target.value);
            this.step(index, this.cumulativeMode);
            this.updateDebugNavigation();
        });
        this.debugBtn.after(this.slider);

        this.backBtn = document.createElement('button');
        this.backBtn.innerHTML = "←";
        this.backBtn.title = "Step back";
        this.backBtn.setAttribute("aria-label", "Back");
        this.backBtn.hidden = true;
        this.backBtn.onclick = () => this.moveSlider(-1);
        this.slider.after(this.backBtn);

        this.forwardBtn = document.createElement('button');
        this.forwardBtn.innerHTML = "→";
        this.forwardBtn.title = "Step forward";
        this.forwardBtn.setAttribute("aria-label", "Forward");
        this.forwardBtn.hidden = true;
        this.forwardBtn.onclick = () => this.moveSlider(1);
        this.backBtn.after(this.forwardBtn);

        this.closeDebugBtn = document.createElement('button');
        this.closeDebugBtn.innerHTML = "×";
        this.closeDebugBtn.title = "Close debug mode";
        this.closeDebugBtn.setAttribute("aria-label", "Close");
        this.closeDebugBtn.hidden = true;
        this.closeDebugBtn.onclick = () => this.setDebugMode(false);
        this.forwardBtn.after(this.closeDebugBtn);

        this.cumulative = document.createElement('button');
        this.cumulative.type = 'button';
        this.cumulative.textContent = '☰';
        this.cumulative.title = 'Show a cumulative trace of expressions';
        this.cumulative.setAttribute('aria-label', 'Cumulative view');
        this.cumulative.setAttribute('aria-pressed', 'false');
        this.cumulative.style.cursor = 'pointer';
        this.cumulative.onclick = () => {
            this.cumulativeMode = !this.cumulativeMode;
            this.cumulative.setAttribute('aria-pressed', this.cumulativeMode.toString());
            this.cumulative.title = `Cumulative view: ${this.cumulativeMode ? 'on' : 'off'}`;
            this.cumulative.style.backgroundColor = this.cumulativeMode ? '#cfe8ff' : '';
            this.cumulative.style.borderColor = this.cumulativeMode ? '#4586bd' : '';
            this.step(Number(this.slider.value), this.cumulativeMode);
        };
        this.cumulative.hidden = true;
        this.backBtn.before(this.cumulative);
    }

    setDebugMode(on) {
        this.debugBtn.hidden = on;
        this.editor.setReadOnly(on);

        this.slider.hidden = !on;
        this.backBtn.hidden = !on;
        this.forwardBtn.hidden = !on;
        this.closeDebugBtn.hidden = !on;
        this.cumulative.hidden = !on;

        if(on) {
            this.editor.container.querySelector('.ace_scroller').style.backgroundColor = '#e8e8e8';
            this.resultLabel.style.visibility = "hidden";
            this.step(0, this.cumulativeMode);
            this.updateDebugNavigation();
        }
        else {
            this.resultLabel.style.visibility = this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
            this.editor.container.querySelector('.ace_scroller').style.backgroundColor = this.editorBackgroundColor
        }
    }

    moveSlider(delta) {
        const index = Math.max(
            Number(this.slider.min),
            Math.min(Number(this.slider.value) + delta, Number(this.slider.max))
        );
        this.slider.value = index.toString();
        this.step(index, this.cumulativeMode);
        this.updateDebugNavigation();
    }

    updateDebugNavigation() {
        const index = Number(this.slider.value);
        this.backBtn.disabled = index <= Number(this.slider.min);
        this.forwardBtn.disabled = index >= Number(this.slider.max);
    }

    runParser() {
        this.resultLabel.textContent = '';
        this.resultLabel.style.visibility = "hidden";
        this.beforeRunListeners.forEach(l => l());
        const code = this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include)
        this.result = window.matte(code, this.callBox.value === "" ? null : this.callBox.value, this.extensions);
        this.clearErrorMarkers();
        this.editor.session.clearAnnotations();
        console.log(this.result)

        if (this.result.error) {
            this.debugBtn.hidden = true;
            const e = this.result.error
            this.editor.session.addMarker(
                this.range2Ace(e.range),
                "ace_error-squiggle",
                "text"
            );
            this.editor.session.setAnnotations([{
                row: e.range.line - 1, // 0-index
                column: 0,
                text: e.message,
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
                this.setDebugMode(true);
            } else {
                this.resultLabel.innerHTML = '';
                // TODO handle script (show var state)
                if (this.result.result?.evaluation !== undefined)
                    this.resultLabel.innerHTML = ' = ' + JSON.stringify(this.result.result.evaluation);
                this.resultLabel.style.visibility = this.result.result?.evaluation !== undefined ? "visible" : "hidden";
                this.slider.max = Math.max(0, this.trace.length - 1).toString();
                this.slider.value = "0";
                this.debugBtn.style.visibility = "visible";
                this.setDebugMode(false);
            }
            this.afterRunListeners.forEach(l => l(this.result));
        }
    }



    popup(offset, message, top, exp) {
        const Tooltip = ace.require("ace/tooltip").Tooltip;
        const tip = new Tooltip(this.editor.container);
        tip.getElement().classList.add(exp ? "ace_tooltip_exp" : "ace_tooltip");
        this.popupPositions.set(tip, {offset, message, top});
        this.popups.push(tip);
        tip.setClassName("my-error-tooltip");
        tip.setHtml(message);
        this.positionPopup(tip, offset, message, top);
        tip.show()
        return tip;
    }

    positionPopup(tip, offset, message, top) {
        const pos = this.editor.session.doc.indexToPosition(offset);
        const y = pos.row;
        const x = top ? pos.column - 1 : this.editor.session.getLine(pos.row).length; // end of line
        const canvasPos = this.editor.renderer.textToScreenCoordinates(y, x);
        if (top)
            canvasPos.pageY -= 25 * (1 + (message.split('\n').length - 1));
        else
            canvasPos.pageX += 10;
        tip.setPosition(canvasPos.pageX, canvasPos.pageY)
    }

    range2Ace(range) {
        const startPos = this.editor.session.doc.indexToPosition(range.start);
        const endPos = this.editor.session.doc.indexToPosition(range.end);
        return new Range(startPos.row, startPos.column, endPos.row, endPos.column);
    }

    pretty(mat) {
        return mat.toString()
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
                const prev = t.range
                    ? this.trace.filter((prev, i) => i < index && prev.range?.start === t.range.start && prev.evaluation != null)
                    : [];
                prevText = prev.map(p => {
                    const mat = p.materialization ? " (" + this.pretty(p.materialization) + ")" : "";
                    return this.prettyPrint(p.evaluation) + mat
                }).join("\n")
                if (prevText.length > 0)
                    prevText += "\n";
            }


            if (t.evaluation != null && t.range) {
                const mat = t.materialization !== t.evaluation.toString() ? t.materialization ? " (" + this.pretty(t.materialization) + ")" : "" : "";
                this.popup(t.range.start, prevText + this.prettyPrint(t.evaluation) + mat, t.isCall, true);
            }
            this.stepListeners.forEach(l => l(this.trace, index));
            this.slider.focus();
            this.resultLabel.style.visibility = index === lastIndex && this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
        } else {
            const lastRange = this.range2Ace(this.trace[lastIndex]);
            this.editor.gotoLine(lastRange.end.row + 1, 1);
            this.stepListeners.forEach(l => l(this.trace, lastIndex));
            this.resultLabel.style.visibility = this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
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
            return "[" + value.join(",&nbsp;") + "]";
        else
            return value.toString();
    }
}
