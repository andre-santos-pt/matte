import {flatTrace, last} from "./utils";
import {compile, getJavaCode} from "./antlr2ast";
import {variableMaterialization} from "./expSimplification";
import {
    ExtensionProcedure,
    ExtensionType,
    Interpreter,
    InterpreterResult,
    RuntimeError,
    TraceEntry
} from "./Interpreter";
import type {Ace} from "ace-builds";
import {Program, StaticError, Type} from "./ast";
import MatteRange from "./Range";
import {SettingProperty, Settings} from "./settings";
import styleCss from "./matte-ace-editor.css";
//import {isDeepStrictEqual} from "assert/build/internal/util/comparisons.js";

//const {Range} = ace.require("ace/range");
declare const ace: typeof import("ace-builds");

type EditorResult = ReturnType<Interpreter["parseAndRun"]>;
type TraceVariables = TraceEntry["stack"]["variables"];
type AceTooltip = Ace.Tooltip;

interface PopupPosition {
    offset: number;
    message: string;
    top: boolean;
}

export interface ErrorMessageHandler {
    transform(error: StaticError): StaticError;
}

class NullErrorMessageHandler implements ErrorMessageHandler {
    transform(error: StaticError): StaticError { return error}
}


export default class MatteAceEditor {
    container!: HTMLElement;
    editor!: Ace.Editor;
    editorBackgroundColor!: string;
    runBar!: HTMLDivElement;
    runBtn!: HTMLButtonElement;
    callBox?: HTMLInputElement;
    resultLabel!: HTMLSpanElement;
    debugBox!: HTMLDivElement;
    debugBtn!: HTMLButtonElement;
    slider!: HTMLInputElement;
    backBtn!: HTMLButtonElement;
    forwardBtn!: HTMLButtonElement;
    closeDebugBtn!: HTMLButtonElement;
    cumulative!: HTMLButtonElement;
    autoHeight!: boolean;
    include?: string | null;
    result: EditorResult | null = null;
    lastCompilationSource: string | null = null;
    compilationError: StaticError | null = null;
    compilationCheckInterval!: number;
    popups: AceTooltip[] = [];
    popupPositions = new WeakMap<AceTooltip, PopupPosition>();
    secondaryMarkers: number[] = [];
    repositionPopups: () => void;
    extensionProcedures: ExtensionProcedure[] = [];
    extensionTypes: ExtensionType[] = [];
    preprocessors: ((p: Program) => void)[] = [];
    beforeRunListeners: Array<() => void> = [];
    afterRunListeners: Array<(result: EditorResult) => void> = [];
    stepListeners: Array<(trace: TraceEntry[], index: number) => void> = [];
    compilationListeners: Array<(compilation: Program | StaticError) => void> = [];
    settings: Settings;
    trace: TraceEntry[] = [];
    private _resizeTimeout: number | null = null;
    errorMessageHandler = new NullErrorMessageHandler();

    readonly: boolean = false;
    norun: boolean = false;

    enable(key: string): void {
        this.settings.enable(key);
    }

    disable(key: string): void {
        this.settings.disable(key);
    }

    setProperty(key: string, value: any): void {
        this.settings.set(key, value);
    }

    constructor(
        container: HTMLElement,
        width?: number | string | null,
        height?: number | string | null,
        call?: string | null,
        readonly? : boolean,
        norun? : boolean
    ) {

        this.readonly = readonly ?? false;
        this.norun = norun ?? false;

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

        this.settings = new Settings(this);


        this.editor = ace.edit(this.container);
        this.editorBackgroundColor = this.getAceScroller().style.backgroundColor;
        this.editor.setTheme(this.settings[SettingProperty.Theme]);
        this.editor.session.setMode("ace/mode/java");
        this.editor.setFontSize(this.settings[SettingProperty.FontSize]);
        this.editor.renderer.setPadding(5);
        this.editor.renderer.setScrollMargin(5, 0, 0, 0);
        this.editor.renderer.setShowGutter(false);
        this.editor.setOption('showLineNumbers', false);
        this.editor.session.setNewLineMode("unix");
        this.editor.setOptions({
            highlightSelectedWord: false
        });
        this.editor.setHighlightActiveLine(false);

        this.settings.createSettingsMenu();

        this.runBar = document.createElement('div');
        this.runBar.style = "display: flex; align-items: center; gap: 10px; margin-top: 5px; margin-bottom: 5px";

        if(!this.norun)
            this.addRunButton();

        this.init();

        this.result = null;
        this.lastCompilationSource = null;
        this.editor.session.on('change', () => {
            this.lastCompilationSource = null;
        });
        this.compilationCheckInterval = window.setInterval(() => this.checkCompilation(), 1000);
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
        this.beforeRunListeners = [];
        this.afterRunListeners = [];
        this.stepListeners = [];

        this.afterRunListeners.push(result => {
            console.log(result)
            this.clearErrorMarkers();
            this.editor.session.clearAnnotations();
            if(result.callError) {
            }
            else if(result.error)
                this.markCompilationError(result.error);
            else {
            if (result.trace)
                this.trace = flatTrace(result.trace).filter(e => e.range && e.range.end < this.editor.getValue().length)
            if (result.runtimeError)
                this.markRuntimeError(result.runtimeError);
            else if (result.program?.block && result.trace?.children?.length)
                this.createScopePopups(last(result.trace.children).stack.variables);
        }
        });

        if(!norun)
            this.addCallBox(call);

        if(readonly)
            this.setReadOnly(true);
    }

    private addRunButton() {
        this.runBtn = document.createElement('button');
        this.runBtn.innerHTML = "▶";
        this.runBtn.title = "Evaluate call";
        this.runBtn.style = "cursor: pointer; border: solid 1px; padding: 2px 10px; border-radius: 3px; font-weight: bold;";
        this.runBtn.onclick = () => {
            this.runParser(this.callBox?.value ?? "");
        }
        this.runBar.append(this.runBtn);

        const parent = this.container.parentElement;
        if (parent) {
            parent.insertBefore(this.runBar, this.container.nextSibling);
        } else {
            this.editor.container.append(this.runBar);
        }
    }

    runPreprocessors() {
        this.preprocessors.forEach((pp: (p: Program) => void) => {
            const compilation = compile(this.getCodeToCompile());
            if(compilation instanceof Program) {
                pp(compilation);
                this.editor.setValue(getJavaCode(compilation))
            }
        })
    }

    addExtensionProcedure(ext: ExtensionProcedure) {
        this.extensionProcedures.push(ext);
    }

    addExtensionType(type: ExtensionType) {
        this.extensionTypes.push(type);
    }

    init(): void {
        this.editor.selection.on("changeCursor", () => {
            this.popups.forEach(p => p.hide(undefined))
            this.clearSecondaryMarkers()
            const compilationError = this.compilationError ? this.errorMessageHandler.transform(this.compilationError) :  this.result?.error;
            const err = compilationError ?? this.result?.runtimeError;
            const index = this.editor.session.doc.positionToIndex(this.editor.getCursorPosition());
            if (err?.range && index >= err.range.start && index <= err.range.end) {

                let message = err.message;
                if (compilationError?.detail) {
                    if (this.settings.compilationhints && compilationError.detail.related) {
                        compilationError.detail.related.forEach((range: MatteRange) => this.markSecondaryHighlights(range))
                    }
                    if (this.settings.compilationhints && compilationError.detail.hint)
                        message += "<hr><small>" + compilationError.detail.hint + "</small>"

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
                if (this._resizeTimeout) window.clearTimeout(this._resizeTimeout);
                this._resizeTimeout = window.setTimeout(() => this.adjustHeight(), 100);
            };

            // initial adjust after renderer is ready
            setTimeout(() => this.adjustHeight(), 0);

            // Adjust when session content changes (typing, paste, etc.)
            this.editor.session.on('change', scheduleAdjust);
            // Also adjust if editor configuration or renderer updates line heights
            this.editor.on('change', scheduleAdjust);
        }
    }

    addExtension(div: HTMLElement): void {
        this.debugBox.after(div);
    }

    private getAceScroller(): HTMLElement {
        const scroller = this.editor.container.querySelector<HTMLElement>(".ace_scroller");
        if (!scroller)
            throw new Error("Ace editor scroller was not found");
        return scroller;
    }

    dispose(): void {
        window.clearInterval(this.compilationCheckInterval);
        window.removeEventListener('scroll', this.repositionPopups, true);
        if (this._resizeTimeout)
            window.clearTimeout(this._resizeTimeout);
        this.clearPopups();
        this.editor.destroy();
    }

// Adjust container height based on the number of visible (screen) lines
    adjustHeight(): void {
        if (!this.autoHeight) return;
        try {
            const session = this.editor.session;
            // screen length accounts for wrapped lines
            const lines = (typeof session.getScreenLength === 'function') ? session.getScreenLength() : session.getLength();
            const lineHeight = (this.editor.renderer && this.editor.renderer.lineHeight) ? this.editor.renderer.lineHeight : 20;
            const padding = 8; // small padding for aesthetics
            const maxHeight = 1200; // avoid growing unbounded
            const minHeight = 25;
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

    getEditorCode(): string {
        return this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include)
    }

    addCallBox(call?: string | null): void {
        const callBox = document.createElement('input');
        this.callBox = callBox;
        callBox.type = "text";
        callBox.title = "Write a call to a function or leave empty to run script";
        callBox.style = "margin-left: 10px; font-family: 'Monaco', 'Menlo', monospace; background-color: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 3px; padding: 2px 5px; width: 300px;";
        callBox.value = call == null ? "" : call;
        callBox.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.runParser(callBox.value);
            }
        });
        this.runBar.append(callBox)

        this.resultLabel = document.createElement('span');
        this.resultLabel.title = "Result of the last evaluation";
        this.resultLabel.style = "font-family: monospace; font-weight: bold; margin-left: 10px;";

        callBox.after(this.resultLabel);
        callBox.addEventListener('input', () => {
            this.resultLabel.style.visibility = "hidden";
        });

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

    updateCallBar(result: EditorResult): void {
        this.resultLabel.style.visibility = result.callError || result.result?.evaluation !== undefined ? "visible" : "hidden";

        if (result.callError)
            this.resultLabel.innerHTML = "<span style='color: #a19f9f; font-style: italic'>" + result.callError + "</span>";
        else if (!result.error && !result.runtimeError) {
            this.resultLabel.innerHTML = '';
            if (result.result?.evaluation !== undefined)
                this.resultLabel.innerHTML = ' = ' + this.prettyPrint(result.result.evaluation, result.call?.type, true);


            const trace = result.trace;
            if (trace?.children?.length) {
                const finalVariables = last(trace.children).stack.variables;
                for (const [key, value] of trace.stack.variables) {
                    const lastValue = finalVariables.get(key);
                    // TODO broken feature because of trace on root with no variables (see stackheap extension)
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
    }

    createDebugBox(): void {
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
        this.resultLabel?.after(this.debugBtn);

        this.slider = document.createElement('input');
        this.slider.type = "range";
        this.slider.min = "0";
        this.slider.value = "0";
        this.slider.hidden = true;
        this.slider.addEventListener('input', () => {
            const index = Number(this.slider.value);
            this.step(index, this.settings.cumulativetrace);
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

        this.afterRunListeners.push(result => {
            this.debugBtn.style.visibility = !result.callError && !result.error ? "visible" : "hidden";
            if(!result.callError && !result.error)
                this.setDebugMode(false);
        })
    }

    setReadOnly(value: boolean) {
        this.editor.setReadOnly(value);
        if (value)
            this.editor.renderer.hideCursor();
        else
            this.editor.renderer.showCursor();

        this.editor.renderer.updateCursor();
    }

    setDebugMode(on: boolean): void {
        this.debugBtn.hidden = on;
        this.slider.hidden = !on;
        this.backBtn.hidden = !on;
        this.forwardBtn.hidden = !on;
        this.closeDebugBtn.hidden = !on;

        this.slider.max = Math.max(0, this.trace.length - 1).toString();
        this.slider.value = "0";

        if (on) {
            this.getAceScroller().style.backgroundColor = '#e8e8e8';
            this.resultLabel.style.visibility = "hidden";
            this.step(0, this.settings.cumulativetrace);
            this.updateDebugNavigation();
            this.clearErrorMarkers();
            this.editor.session.clearAnnotations();
            this.setReadOnly(true);
        } else {
            this.resultLabel.style.visibility = this.result?.result?.evaluation !== undefined ? "visible" : "hidden";
            this.getAceScroller().style.backgroundColor = this.editorBackgroundColor;
           // this.clearPopups()
            this.editor.clearSelection();
            this.setReadOnly(this.readonly);
        }
    }

    moveSlider(delta: number): void {
        const index = Math.max(
            Number(this.slider.min),
            Math.min(Number(this.slider.value) + delta, Number(this.slider.max))
        );
        this.slider.value = index.toString();
        this.step(index, this.settings.cumulativetrace);
        this.updateDebugNavigation();
    }

    updateDebugNavigation(): void {
        const index = Number(this.slider.value);
        this.backBtn.disabled = index <= Number(this.slider.min);
        this.forwardBtn.disabled = index >= Number(this.slider.max);
    }

    getCodeToCompile(): string {
        return this.editor.getValue() + (this.include == null ? "" : "\n\n" + this.include);
    }

    checkCompilation(): void {
        if(!this.settings.autocompile)
            return;

        const code = this.getCodeToCompile()
        if (code === this.lastCompilationSource)
            return;

        const compilation = compile(code);
        this.lastCompilationSource = code;
        this.compilationListeners.forEach(listener => listener(compilation));
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
            if (this.settings.autorun)
                this.runParser(this.callBox?.value ?? "");
        }
    }


    createInterpreter(): Interpreter {
        const interpreter = new Interpreter(this.settings.maxLoopIterations, this.settings.maxCallStack);
        this.extensionProcedures.forEach((extension) => {
            interpreter.addExtensionProcedure(extension);
        });
        this.extensionTypes.forEach((type) => {
            interpreter.addExtensionType(type.name, type.constProcedure, ...type.operations);
        });
        return interpreter;
    }

    runParser(call: string): void {
        let src = this.getCodeToCompile()
        this.beforeRunListeners.forEach(l => l());
        this.lastCompilationSource = src;
        const result = this.createInterpreter().parseAndRun(src, call === "" ? undefined : call);
        this.result = result;
        this.afterRunListeners.forEach(l => l(result));
    }

    runParserStandalone(call: string): InterpreterResult {
        let src = this.getCodeToCompile()
        return this.createInterpreter().parseAndRun(src, call === "" ? undefined : call);
    }

    step(index: number, cumulative = false): void {
        const lastIndex = this.trace.length - 1;
        if (index >= 0 && index <= lastIndex) {
            const t = this.trace[index];
            if (t.range)
                this.editor.revealRange(this.range2Ace(t.range));
            this.clearPopups();
            if (t.stack.variables)
                this.createScopePopups(t.stack.variables);

            if (t.error?.range)
                this.popup(t.error.range.start, t.error.message, false, "error-popup");

            let prevText = "";
            const range = t.range;
            if (cumulative) {
                const prev = range
                    ? this.trace.filter((prev, i) => i < index && prev.range?.start === range.start && prev.range?.end === range.end && prev.evaluation != null)
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


    popup(offset: number, message: string, top = false, style?: string): AceTooltip | undefined {
        if(offset >= this.editor.getValue().length)
            return
        const Tooltip = ace.require("ace/tooltip").Tooltip as new (parent: Element) => AceTooltip;
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

    positionPopup(tip: AceTooltip, offset: number, message: string, top: boolean): void {
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

    range2Ace(range: MatteRange): Ace.Range {
        const startPos = this.editor.session.doc.indexToPosition(range.start);
        const endPos = this.editor.session.doc.indexToPosition(range.end);
        const AceRange = ace.require("ace/range").Range as new (
            startRow: number,
            startColumn: number,
            endRow: number,
            endColumn: number
        ) => Ace.Range;
        return new AceRange(startPos.row, startPos.column, endPos.row, endPos.column);
    }

    pretty(mat: string): string {
        return mat.toString()
            .replace(/&&/g, "∧")
            .replace(/\|\|/g, "∨")
            .replace(/!=/g, "≠")
            .replace(/!/g, "¬")
            .replace(/<=/g, "≤")
            .replace(/>=/g, "≥")
    }

    isLiteral(value: unknown): boolean {
        return value === null || (typeof value !== "object" && typeof value !== "function");
    }

    markCompilationError(e: StaticError): void {
        const eTrans = this.errorMessageHandler.transform(e)
        this.editor.session.addMarker(
            this.range2Ace(eTrans.range),
            "compilation-error",
            "text"
        );
        this.editor.session.setAnnotations([{
            row: eTrans.range.line - 1, // 0-index
            column: 0,
            text: eTrans.message,
            type: "error" // Options: "error", "warning", or "info"
        }]);
    }

    markSecondaryHighlights(r: MatteRange): void {
        this.secondaryMarkers.push(this.editor.session.addMarker(
            this.range2Ace(r),
            "secondary-mark",
            "text"
        ))
    }

    highlightedRange?: number = undefined
    highlightRange(range: MatteRange) {
        this.highlightedRange = this.editor.session.addMarker(
            this.range2Ace(range),
            "range-highlight",
            "text"
        );
    }

    highlightLine(line: number, style: string): void {
        const row = line - 1;
        if (!Number.isInteger(line) || row < 0 || row >= this.editor.session.getLength())
            throw new RangeError(`Line number must be between 1 and ${this.editor.session.getLength()}`);

        const AceRange = ace.require("ace/range").Range as new (
            startRow: number,
            startColumn: number,
            endRow: number,
            endColumn: number
        ) => Ace.Range;
        this.highlightedRange = this.editor.session.addMarker(
            new AceRange(row, 0, row, Infinity),
            style,
            "fullLine"
        );
    }

    clearHighlight() {
        if(this.highlightedRange)
            this.editor.session.removeMarker(this.highlightedRange);
    }

    markRuntimeError(e: RuntimeError): void {
        if (!e.range)
            return;
        this.editor.session.addMarker(
            this.range2Ace(e.range),
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

    clearPopups(): void {
        this.popups.forEach(p => p.hide(undefined));
    }

    clearErrorMarkers(): void {
        const session = this.editor.getSession();
        const markers = session.getMarkers();

        for (const id in markers) {
            if (markers[id].clazz === "compilation-error" || markers[id].clazz === "runtime-error") {
                session.removeMarker(Number(id));
            }
        }
    }

    clearSecondaryMarkers(): void {
        this.secondaryMarkers.forEach(m => {
            this.editor.session.removeMarker(m);
        })
        this.secondaryMarkers = []
    }

    createScopePopups(dataMap?: TraceVariables): void {
        if (dataMap === undefined || !this.settings.variablematerialization)
            return

        for (const [key, value] of dataMap) {
            const mat = variableMaterialization(value)
            const matText = mat ? "<small> (" + mat + ")</small>" : "";
            if(value.declaration)
                this.popup(value.declaration.end, this.prettyPrint(value.evaluation, value.type) + matText, false);

            else if(key === "this") {
                Object.keys(value.evaluation).forEach(f => {
                    if(f !== "$type" && value.evaluation[f].declaration)
                        this.popup(value.evaluation[f].declaration.end, this.prettyPrint(value.evaluation[f].evaluation, value.evaluation[f].type) + matText, false)
                })
            }


        }
    }

    prettyPrint(value: unknown, type?: Type, noRounding = false): string {
        const prettyPrintObject = (value: object): string => {
            const fields = value as Record<string, {evaluation: unknown}>;
            return "{" + Object.keys(fields).filter(k => k !== "$type").map(k => `${k}: ${this.prettyPrint(fields[k].evaluation)}`).join(", ") + "}";
        };
        function formatNumberIfNeeded(num: number): string {
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
            return prettyPrintObject(value)
        else if (typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value) && !noRounding)
            return formatNumberIfNeeded(value);
        else if (typeof value === "number" && Number.isInteger(value) && type === "double")
            return value.toString() + ".0";
        else if(typeof value === "string")
            return "\"" + value + "\""
        else
            return value.toString();
    }



    // enable(key: string): void {
    //     // @ts-ignore
    //     this.settings[key] = true;
    //     const checkbox = document.getElementById(this.containerGenId + "-" + key) as HTMLInputElement | null; // TODO Bug: This will not work if the checkbox is not in the DOM yet. Consider storing a reference to the checkbox when creating it.
    //     if (checkbox)
    //         checkbox.checked = true;
    //
    //     // @ts-ignore
    //     const action = settingsConf[key]?.action
    //     if(action)
    //         action.call(null, this, true)
    // }
    //
    // disable(key: string): void {
    //     // @ts-ignore
    //     if(this.settings[key] === undefined)
    //         console.error(`Setting '${key}' does not exist in MatteAceEditor settings.`);
    //     // @ts-ignore
    //     this.settings[key] = false;
    //     const checkbox = document.getElementById(this.containerGenId + "-" + key) as HTMLInputElement | null; // TODO Bug: This will not work if the checkbox is not in the DOM yet. Consider storing a reference to the checkbox when creating it.
    //     if (checkbox)
    //         checkbox.checked = false;
    //
    //     // @ts-ignore
    //     const action = settingsConf[key]?.action
    //     if(action)
    //         action.call(null, this, false)
    // }
}
