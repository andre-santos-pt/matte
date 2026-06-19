import {ParserRuleContext} from "antlr4";
import {TraceEntry} from "./Interpreter";

export function last<T>(arr: T[]): T {
    return arr[arr.length - 1];
}

export function lastTrace(trace: TraceEntry): TraceEntry {
    if(trace.children)
        return lastTrace(last(trace.children))
    else
        return trace
}

export function countTraceEntries(trace: TraceEntry): number {
    if(trace.children)
        return 1 + trace.children.length + trace.children.map(e => countTraceEntries(e)).reduce((a,c) => a + c, 0)
    else
        return 1
}


export function flatTrace(trace: TraceEntry): TraceEntry[]{
    if(trace.children)
        return [trace, ... trace.children.flatMap(t => flatTrace(t))]
    else
        return [trace]
}

export function filter<T>(ctx: ParserRuleContext, pred: (o: unknown) => boolean): T[] {
    const result: T[] = [];
    for (let i = 0; i < ctx.getChildCount(); i++) {
        const child = ctx.getChild(i);
        if (pred(child)) {
            result.push(child as T);
        }
    }
    return result
}