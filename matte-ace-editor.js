import {flatTrace, last, lastTrace} from "./src/utils.ts";
import {compile} from "./src/antlr2ast.ts";
import {
    simplifyExpression,
    variableMaterialization
} from "./src/expSimplification.ts";
import {Interpreter} from "./src/Interpreter.ts";
//import {isDeepStrictEqual} from "assert/build/internal/util/comparisons.js";

const {Range} = ace.require("ace/range");

const styleCss =
    `.compilation-error {
                position: absolute;
                /* Increased height to 6px and stroke-width to 1.5 for better visibility */
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6'%3E%3Cpath d='M0 5c1 0 2-3 4-3s3 3 4 3' fill='none' stroke='%23ff3333' stroke-width='1.5'/%3E%3C/svg%3E");
                background-repeat: repeat-x;
                background-position: bottom;
                z-index: 20;
                /* Optional: add a slight vertical offset if it's too close to the text */
                margin-bottom: 1px;
            }
            .runtime-error {
                position: absolute;
                background-color: rgba(255, 0, 0, 0.3);
                border-bottom: 2px wavy red;
                z-index: 20;
            }
            .secondary-mark {
                position: absolute;
                background-color: rgba(255, 255, 150, 1.0);
                border-bottom: 2px wavy red;
                z-index: 20;
            }
            
            .popup {
                background:  rgba(235, 235, 235, 1);
                color: rgba(148, 148, 148, 1);
                border: 0px solid #111111;
                border-radius: 2px;
                padding: 1px;
                font-family: 'Monaco', 'Menlo', monospace;
                //font-size: 10pt !important;
                white-space: pre-wrap;
            }
           
           .error-popup {
             background-color: rgba(255, 0, 0, 0.2);
             }
             
             .materialization {
                font-size: x-small;
                font-color: #aaaaaa
                }
                
             .materialization-popup {
             background-color: rgb(218, 234, 255, 1)
             }
             
            .popup b {
                color: black;
                font-weight: bold;
            }

            .matte-ace-settings {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 10;
                color: #222;
                font: 13px Arial, sans-serif;
            }

            .matte-ace-settings summary {
                box-sizing: border-box;
                width: 30px;
                height: 28px;
                padding: 5px;
                border: 1px solid #c8c8c8;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.95);
                cursor: pointer;
                list-style: none;
                text-align: center;
            }

            .matte-ace-settings summary::-webkit-details-marker {
                display: none;
            }

            .matte-ace-settings-panel {
                position: absolute;
                top: 32px;
                z-index: 20;
                right: 0;
                display: grid;
                min-width: 250px;
                gap: 10px;
                padding: 12px;
                border: 1px solid #c8c8c8;
                border-radius: 5px;
                background: #eee;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }

            .matte-ace-settings-panel label {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }

            .matte-ace-settings-panel select {
                max-width: 120px;
            }
           `;

export default class MatteAceEditor {
    constructor(container, width, height, call) {
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
        this.editor.setFontSize(14);
        this.editor.renderer.setPadding(5);
        this.editor.renderer.setScrollMargin(5, 0, 0, 0);
        this.editor.renderer.setShowGutter(false);
        this.editor.setOption('showLineNumbers', false);
        this.editor.session.setNewLineMode("unix");
        this.editor.setOptions({
            highlightSelectedWord: false
        });
        this.editor.setHighlightActiveLine(false);

        this.runBar = document.createElement('div');
        this.runBar.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";

        this.runBtn = document.createElement('button');
        this.runBtn.innerHTML = "▶";
        this.runBtn.title = "Evaluate call";
        this.runBtn.style = "cursor: pointer; border: solid 1px; padding: 2px 10px; border-radius: 3px; font-weight: bold;";
        this.runBtn.onclick = () => {
            this.runParser(this.getEditorCode(), this.callBox?.value ?? "");
        }
        this.runBar.append(this.runBtn);

        const parent = this.container.parentElement;
        if (parent) {
            parent.insertBefore(this.runBar, this.container.nextSibling);
        } else {
            this.editor.container.append(this.runBar);
        }


        this.init();

        this.result = null;
        this.lastCompilationSource = null;
        this.editor.session.on('change', () => {
            this.lastCompilationSource = null;
        });
        this.compilationCheckInterval = window.setInterval(() => this.checkCompilation(), 2000); // TODO to autocompile
        this.popups = [];
        this.popupPositions = new WeakMap();
        this.secondaryMarkers = [];
        this.repositionPopups = () => {
            this.popups.forEach(tip => {
                const position = this.popupPositions.get(tip);
                if (position)
                    this.positionPopup(tip, position.offset, position.message, position.top);
            });
        };
        window.addEventListener('scroll', this.repositionPopups, true);
        this.extensions = new Map();
        this.beforeRunListeners = [];
        this.afterRunListeners = [];
        this.stepListeners = [];

        this.showCompilationHints = true;

        this.maxLoopIterations = 100;
        this.maxCallStack = 100;

        this.addSettingsMenu();

        this.afterRunListeners.push(result => {
            console.log(result)
            this.clearErrorMarkers();
            this.editor.session.clearAnnotations();
            if(result.callError) {
            }
            else if(result.error)
                this.markCompilationError(result.error);
            else {
                this.trace = flatTrace(result.trace)
                if (result.runtimeError)
                    this.markRuntimeError(result.runtimeError);
                else if (result.program.block)
                    this.createScopePopups(last(result.trace.children).stack.variables);
            }
        });

        this.addCallBox(call);
    }

    addExtensionProcedure(name, func) {
        this.extensions.set(name, func);
    }


    init() {
        this.editor.selection.on("changeCursor", () => {
            this.popups.forEach(p => p.hide())
            this.clearSecondaryMarkers()
            const err = this.compilationError ?? this.result?.error ?? this.result?.runtimeError;
            const index = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
            if (err && index >= err.range.start && index <= err.range.end) {

                let message = err.message;
                if (err.detail) {
                    if (this.showCompilationHints && err.detail.related) {
                        err.detail.related.forEach(r => this.markSecondaryHighlights(r))
                    }
                    if (this.showCompilationHints && err.detail.hint)
                        message += "<hr><small>" + err.detail.hint + "</small>"

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

    addExtension(div) {
        this.debugBox.after(div);
    }

    dispose() {
        window.clearInterval(this.compilationCheckInterval);
        window.removeEventListener('scroll', this.repositionPopups, true);
        if (this._resizeTimeout)
            window.clearTimeout(this._resizeTimeout);
        this.clearPopups();
        this.editor.destroy();
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

    getEditorCode() {
        return this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include)
    }

    addCallBox(call) {
        this.callBox = document.createElement('input');
        this.callBox.type = "text";
        this.callBox.title = "Write a call to a function or leave empty to run script";
        this.callBox.style = "margin-left: 10px; font-family: 'Monaco', 'Menlo', monospace; background-color: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 3px; padding: 2px 5px; width: 300px;";
        this.callBox.value = call == null ? "" : call;
        this.callBox.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.runParser(this.getEditorCode(), this.callBox.value);
            }
        });
        this.runBar.append(this.callBox)

        this.resultLabel = document.createElement('span');
        this.resultLabel.title = "Result of the last evaluation";
        this.resultLabel.style = "font-family: monospace; font-weight: bold; margin-left: 10px;";

        this.callBox.after(this.resultLabel);
        this.callBox.addEventListener('input', () => {
            this.resultLabel.style.visibility = "hidden";
        });

        this.cumulativeMode = false;
        this.editor.container.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== 'Backspace' && event.key !== 'Delete' && (!this.editor.getReadOnly() || event.key.length !== 1 ||
                event.ctrlKey || event.metaKey || event.altKey || event.isComposing))
                return;
            this.clearPopups();
            const cursorIndex = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
            this.popup(cursorIndex, "Read-only. Close the debug mode to edit the code.", true); // TODO bug?
        }, true);

        this.editor.session.on('change', () => {
            this.resultLabel.textContent = '';
            this.resultLabel.style.visibility = "hidden";
        });
        this.afterRunListeners.push(result => this.updateCallBar(result))
        this.createDebugBox();
    }

    updateCallBar(result) {
        this.resultLabel.style.visibility = result.callError || result.result?.evaluation !== undefined ? "visible" : "hidden";

        if (result.callError)
            this.resultLabel.innerHTML = "<span style='color: #a19f9f; font-style: italic'>" + result.callError + "</span>";
        else if (!result.error && !result.runtimeError) {
            this.resultLabel.innerHTML = '';
            if (result.result?.evaluation !== undefined)
                this.resultLabel.innerHTML = ' = ' + this.prettyPrint(result.result.evaluation, result.call.type, true);


            for (const [key, value] of result.trace.stack.variables) {
                const lastValue = last(result.trace.children).stack.variables.get(key);
                if (lastValue && JSON.stringify(value.evaluation) !== JSON.stringify(lastValue.evaluation)) {
                    const map = new Map();
                    map.set(key, lastValue);
                    this.createScopePopups(map);
                    if (this.resultLabel.innerHTML !== "")
                        this.resultLabel.innerHTML += "<br>";
                    this.resultLabel.innerHTML += "Argument modified"
                    this.resultLabel.style.visibility = "visible"
                }
            }
        }
    }

    createDebugBox() {
        this.debugBox = document.createElement('div');
        this.debugBox.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";
        this.runBar.after(this.debugBox);
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
        this.afterRunListeners.push(result => {
            this.debugBtn.style.visibility = !result.callError && !result.compilationError ? "visible" : "hidden";
            if(!result.callError)
                this.setDebugMode(false);
        })
    }

    setDebugMode(on) {
        this.debugBtn.hidden = on;
        this.editor.setReadOnly(on);

        this.slider.hidden = !on;
        this.backBtn.hidden = !on;
        this.forwardBtn.hidden = !on;
        this.closeDebugBtn.hidden = !on;
        this.cumulative.hidden = !on;

        this.slider.max = Math.max(0, this.trace.length - 1).toString();
        this.slider.value = "0";

        if (on) {
            this.editor.container.querySelector('.ace_scroller').style.backgroundColor = '#e8e8e8';
            this.resultLabel.style.visibility = "hidden";
            this.step(0, this.cumulativeMode);
            this.updateDebugNavigation();
            this.clearErrorMarkers();
            this.editor.session.clearAnnotations();
        } else {
            this.resultLabel.style.visibility = this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
            this.editor.container.querySelector('.ace_scroller').style.backgroundColor = this.editorBackgroundColor;
           // this.clearPopups()
            this.editor.clearSelection();
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

    checkCompilation() {
        const code = this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include);
        if (code === this.lastCompilationSource)
            return;

        const compilation = compile(code);
        this.lastCompilationSource = code;
        this.clearErrorMarkers();
        this.editor.session.clearAnnotations();

        if ("type" in compilation) {
            this.compilationError = compilation;
            this.markCompilationError(compilation);
            if (this.runBtn)
                this.runBtn.disabled = true;
        } else {
            this.compilationError = null;
            if (this.runBtn)
                this.runBtn.disabled = false;
            this.clearPopups();
            this.clearSecondaryMarkers();
            // if (compilation.block)
            //     this.runParser(this.getEditorCode(), "");
        }
    }


    createInterpreter() {
        const interpreter = new Interpreter(this.maxLoopIterations, this.maxCallStack);
        this.extensions.keys().forEach(key => {
            interpreter.addExtensionProcedure(key, this.extensions.get(key));
        });
        return interpreter;
    }

    runParser(code, call) {
        this.beforeRunListeners.forEach(l => l());
        this.lastCompilationSource = code;

        this.result = this.createInterpreter().parseAndRun(code, call === "" ? null : call);
        // if (!this.result.callError && !this.result.error)
        //     this.trace = flatTrace(this.result.trace)

        this.afterRunListeners.forEach(l => l(this.result));

    }


    step(index, cumulative = false) {
        const lastIndex = this.trace.length - 1;
        if (index >= 0 && index <= lastIndex) {
            const t = this.trace[index];
            if (t.range)
                this.editor.revealRange(this.range2Ace(t.range));
            this.clearPopups();
            if (t.stack.variables)
                this.createScopePopups(t.stack.variables);

            if (t.error)
                this.popup(t.error.range.start, t.error.message, false, "error-popup");

            let prevText = "";
            if (cumulative) {
                const prev = t.range
                    ? this.trace.filter((prev, i) => i < index && prev.range?.start === t.range.start && prev.range?.end === t.range.end && prev.evaluation != null)
                    : [];
                prevText = prev.map(p => {
                    const mat = p.materialization ? " (" + this.pretty(p.materialization) + ")" : "";
                    return "<span class=\"materialization\">" + this.prettyPrint(p.evaluation) + mat + "</span>";
                }).join("\n")
                if (prevText.length > 0)
                    prevText += "\n";
            }

            if (t.evaluation != null && t.range) {
                let text = this.prettyPrint(t.evaluation);
                if (t.materialization != null && !Array.isArray(t.evaluation) && text !== t.materialization.toString())
                    text += "<span class=\"materialization\"> (" + this.pretty(t.materialization) + ")</span>";
                this.popup(t.range.start, prevText + text, t.call, "materialization-popup");
            }
            this.stepListeners.forEach(l => l(this.trace, index));
            this.slider.focus();
            this.resultLabel.style.visibility = index === lastIndex && this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
        }
    }


    popup(offset, message, top, style) {
        const Tooltip = ace.require("ace/tooltip").Tooltip;
        const tip = new Tooltip(this.editor.container);
        this.popupPositions.set(tip, {offset, message, top});
        this.popups.push(tip);
        tip.getElement().classList.add("popup");
        if (style)
            tip.getElement().classList.add(style);
        tip.setHtml(message.replace(/'(.*?)'/g, '<b>$1</b>'));
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

    isLiteral(value) {
        return value === null || (typeof value !== "object" && typeof value !== "function");
    }

    markCompilationError(e) {
        this.editor.session.addMarker(
            this.range2Ace(e.range),
            "compilation-error",
            "text"
        );
        this.editor.session.setAnnotations([{
            row: e.range.line - 1, // 0-index
            column: 0,
            text: e.message,
            type: "error" // Options: "error", "warning", or "info"
        }]);
    }

    markSecondaryHighlights(r) {
        this.secondaryMarkers.push(this.editor.session.addMarker(
            this.range2Ace(r),
            "secondary-mark",
            "text"
        ))
    }

    markRuntimeError(e) {
        this.editor.session.addMarker(
            this.range2Ace(this.result.runtimeError.range),
            "runtime-error",
            "text"
        );
        this.editor.session.setAnnotations([{
            row: e.range.line - 1, // 0-index
            column: 0,
            text: e.message,
            type: "warning" // Options: "error", "warning", or "info"
        }]);
    }

    clearPopups() {
        this.popups.forEach(p => p.hide());
    }

    clearErrorMarkers() {
        const session = this.editor.getSession();
        const markers = session.getMarkers();

        for (const id in markers) {
            if (markers[id].clazz === "compilation-error" || markers[id].clazz === "runtime-error") {
                session.removeMarker(id);
            }
        }
    }

    clearSecondaryMarkers() {
        this.secondaryMarkers.forEach(m => {
            this.editor.session.removeMarker(m);
        })
        this.secondaryMarkers = []
    }

    createScopePopups(dataMap) {
        if (dataMap === undefined)
            return

        for (const [key, value] of dataMap) {
            const mat = variableMaterialization(value)
            const matText = mat ? "<small> (" + mat + ")</small>" : "";
            if(value.declaration)
                this.popup(value.declaration.end, this.prettyPrint(value.evaluation, value.type) + matText, false);

            else if(key === "this") {
                Object.keys(value.evaluation).forEach(f => {
                    if(f !== "$type" && value.evaluation[f].declaration) {
                        console.log(f, value.evaluation[f])
                        this.popup(value.evaluation[f].declaration.end, this.prettyPrint(value.evaluation[f].evaluation, f.type) + matText, false)
                    }
                })
            }


        }
    }

    prettyPrint(value, type, noRounding) {
        function formatNumberIfNeeded(num) {
            const str = num.toString();
            let decimalPlaces = 0;

            // Check for standard decimals (e.g., "3.14159")
            if (str.includes('.')) {
                decimalPlaces = str.split('.')[1].length;
            }
            // Handle scientific notation for very small numbers (e.g., "1e-5")
            else if (str.includes('e-')) {
                decimalPlaces = parseInt(str.split('e-')[1], 10);
            }

            // If it has more than 3 decimal places, format it to 3
            if (decimalPlaces > 3) {
                return Number.parseFloat(num.toFixed(3)).toString();
            }

            return str;
        }

        if (value === null || value === undefined)
            return "null";
        else if (Array.isArray(value))
            return "[" + value.join(",&nbsp;") + "]";
        else if (typeof value === "object")
            return "{" + Object.keys(value).filter(k => k !== "$type").map(k => `${k}: ${this.prettyPrint(value[k])}`).join(", ") + "}"
        else if (Number.isFinite(value) && !Number.isInteger(value) && !noRounding)
            return formatNumberIfNeeded(value);
        else if (Number.isInteger(value) && type === "double")
            return value.toString() + ".0";
        else if(typeof value === "string")
            return "\"" + value + "\""
        else
            return value.toString();
    }

    addSettingsMenu() {
        const host = this.container.parentElement;
        if (!host)
            return;
        host.style.display = "block";
        if (window.getComputedStyle(host).position === "static")
            host.style.position = "relative";

        const details = document.createElement("details");
        details.className = "matte-ace-settings";

        const summary = document.createElement("summary");
        summary.textContent = "\u2699";
        summary.title = "Editor settings";
        summary.setAttribute("aria-label", "Editor settings");
        details.append(summary);

        const panel = document.createElement("div");
        panel.className = "matte-ace-settings-panel";
        details.append(panel);

        const addSelect = (labelText, values, selectedValue, onChange) => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const select = document.createElement("select");
            for (const [value, text] of values) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = text;
                select.append(option);
            }
            select.value = selectedValue;
            select.addEventListener("change", () => onChange(select.value));
            label.append(select);
            panel.append(label);
        };

        const addPositiveNumber = (labelText, value, onChange) => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = "any";
            input.value = value;
            input.addEventListener("change", () => {
                const number = input.valueAsNumber;
                if (input.value.trim().length === 0)
                    onChange(undefined);
                else if (Number.isFinite(number) && number > 0)
                    onChange(number);
                else
                    input.value = value;
            });
            label.append(input);
            panel.append(label);
        };

        const addCheckbox = (id, labelText, checked, onChange) => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.type = "checkbox";
            input.id = id;
            input.checked = checked;
            input.addEventListener("change", () => onChange(input.checked));
            label.append(input);
            panel.append(label);
        };

        addSelect(
            "Font size",
            [12, 14, 16, 18, 20, 24, 28].map(size => [String(size), `${size}px`]),
            "20",
            size => this.editor.setFontSize(Number(size))
        );
        addSelect(
            "Theme",
            [
                ["ace/theme/textmate", "TextMate"],
                ["ace/theme/monokai", "Monokai"],
                ["ace/theme/github", "GitHub"],
                ["ace/theme/solarized_light", "Solarized Light"],
                ["ace/theme/solarized_dark", "Solarized Dark"]
            ],
            "ace/theme/textmate",
            theme => this.editor.setTheme(theme)
        );
        addCheckbox("line-numbers", "Line numbers", false, show => {
            this.editor.setOption("showLineNumbers", show);
            this.editor.setOption("showGutter", show);
        });
        //addCheckbox("word-wrap", "Word wrap", false, wrap => this.editor.session.setUseWrapMode(wrap));
        addCheckbox("line-highlight", "Highlight active line", false, highlight => this.editor.setHighlightActiveLine(highlight));
        //addCheckbox("Show invisibles", false, show => this.editor.setShowInvisibles(show));

        panel.append(document.createElement("hr"));

        addPositiveNumber("Maximum loop iterations", this.maxLoopIterations.toString(), v => this.maxLoopIterations = v);

        addPositiveNumber("Maximum call stack size", this.maxCallStack.toString(), v => this.maxCallStack = v);

        addCheckbox("compilation-hints", "Show compilation hints", this.showCompilationHints, show => this.showCompilationHints = show);

        host.append(details);
    }

    disableCompilationHints() {
        this.showCompilationHints = false;
        document.getElementById("compilation-hints").checked = false;
    }
}
