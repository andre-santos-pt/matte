import {ParserRuleContext} from "antlr4";

export function last<T>(arr: T[]): T {
    return arr[arr.length - 1];
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