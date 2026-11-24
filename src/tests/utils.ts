import {
    Interpreter,
    RuntimeErrorType
} from "../Interpreter";
import assert from "assert";
import {last, lastTrace} from "../utils";
import {Program, StaticErrorType} from "../ast";
import {compile} from "../antlr2ast";

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
    const interpreter = new Interpreter();
    const result = compile(code)
    if(result.errors.length != 1) {
        console.log(result.errors)
        assert.fail( "expected a single compilation error")
    }

    assert.equal(result.errors[0].type, expected);
}

export function runtimeError(code: string, expected: RuntimeErrorType, call?: string, interpreter = new Interpreter()) {
    const result = interpreter.parseAndRun(code, call);
    if(result.compilationErrors.length != 0) {
        console.table(result.compilationErrors[0])
        assert.fail(`Compilation error: ${result.compilationErrors[0].message}`)
    }
    if(result.callError)
        assert.fail(result.callError)
    if(!result.trace)
        assert.fail(`No trace`)

    assert.equal(lastTrace(result.trace).error?.type, expected);
}

export function cases(code: string, ...tests: [string, any][]) {
    const interpreter = new Interpreter();
    tests.forEach(t => {
        const result = interpreter.parseAndRun(code, t[0]);
        if(result.callError != undefined) {
            assert.fail(`Call error: ${t[0]}`)
        }
        if(result.compilationErrors.length != 0) {
            console.table(result.compilationErrors[0])
            assert.fail(`Compilation error: ${result.compilationErrors[0].message}`)
        }
        if(result.runtimeError) {
            assert.fail(`Runtime error ${result.runtimeError.message}`)
        }
        const ev = typeof result.result.evaluation === "object" ? unwrapEvaluations(result.result.evaluation) : result.result.evaluation;
        assert.deepStrictEqual(ev, t[1], t[0]);
    })
}

export function script(code: string, cases: Map<string, any>): Program | undefined {
    const interpreter = new Interpreter();
    let result = interpreter.parseAndRun(code);
    if(result.compilationErrors.length != 0) {
        console.table(result.compilationErrors[0])
        assert.fail(`Compilation error: ${result.compilationErrors[0].message}`)
    }
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
    return result.program
}