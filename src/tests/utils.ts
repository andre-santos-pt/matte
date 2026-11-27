import {
    Interpreter,
    RuntimeErrorType
} from "../Interpreter";
import assert from "assert";
import {lastTrace} from "../utils";
import {CallExpression, Program, StaticErrorType} from "../ast";
import {JavaCompiler} from "../antlr2ast";

export function unwrapEvaluations(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).map(([name, property]) => {
        if (name === "$type")
            return [name, property];
        if (!property || typeof property !== "object" || !("evaluation" in property))
            throw new TypeError(`Property "${name}" does not contain an evaluation`);
        return [name, property.evaluation];
    }));
}

export function compilationError(code: string, expected: StaticErrorType, call?: string) {
    const result = new JavaCompiler().compile(code)
    if(result.errors.length != 1) {
        console.log(result.errors)
        assert.fail("expected a single compilation error")
    }
    assert.equal(result.errors[0].type, expected);
    return result.errors[0]
}

export function runtimeError(code: string, expected: RuntimeErrorType, call?: string, interpreter = new Interpreter()) {
    const program = compileAssert(code)
    const callExp = call ? new JavaCompiler().compileCall(program, call) as CallExpression : undefined;
    const result = interpreter.runProgram(program, callExp)
    //if(result.callError)
    //    assert.fail(result.callError.message)
    if(!result.trace)
        assert.fail(`No trace`)

    assert.equal(lastTrace(result.trace).error?.type, expected);
}

export function cases(code: string, ...tests: [string, any][]) {
    const program = compileAssert(code)
    const interpreter = new Interpreter();
    tests.forEach(t => {
        const call = new JavaCompiler().compileCall(program, t[0]) as CallExpression
        const result = interpreter.runProgram(program, call);
        if(result.runtimeError)
            assert.fail(`Runtime error ${result.runtimeError.message}`)
        const ev = result.result.evaluation && typeof result.result.evaluation === "object" && !Array.isArray(result.result.evaluation) ? unwrapEvaluations(result.result.evaluation) : result.result.evaluation;
        assert.deepStrictEqual(ev, t[1], t[0]);
    })
}

export function compileAssert(code: string): Program {
    const compilation = new JavaCompiler().compile(code)
    if(compilation.errors.length != 0) {
        console.table(compilation.errors[0])
        assert.fail(`Compilation error: ${compilation.errors[0].message}`)
    }
    return compilation.program!
}

export function compileRunAssert(code: string, interpreter: Interpreter = new Interpreter()) {
    const program = compileAssert(code)
    const res = interpreter.runProgram(program)
    assert.equal(res.runtimeError, undefined)
    return res
}

export function buildAST(src: string) {
    return new JavaCompiler().compile(src).program!
}


export function script(code: string, cases: Map<string, any>): Program | undefined {
    const program = compileAssert(code)
    const interpreter = new Interpreter();
    let result = interpreter.runProgram(program);

    if(!result.trace)
        assert.fail(`No trace`)
    if (lastTrace(result.trace)?.error)
        assert.fail(lastTrace(result.trace)?.error?.message)
    else {
        const mapToObj = (m:Map<any, any>) =>
            Object.fromEntries([...m.entries()]);

        const evaluationMap = new Map([...lastTrace(result.trace).stack.variables].map(
            ([name, variable]) => [name, variable.evaluation]
        ))
        const actual = JSON.parse(JSON.stringify(mapToObj(evaluationMap)))
        const expected = JSON.parse(JSON.stringify(mapToObj(cases)))
        try {
            assert.deepStrictEqual(actual, expected, evaluationMap.toString());
        } catch (returnObj) {
            console.table(evaluationMap);
            throw returnObj
        }
    }
    return program
}