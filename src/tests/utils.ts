import {
    Interpreter,
    RuntimeErrorType
} from "../Interpreter";
import assert from "assert";
import {last} from "../utils";
import {CompilationErrorType} from "../ast";

export function compilationError(code: string, expected: CompilationErrorType, call?: string) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code, call);
    if(result.errors.length == 0)
        assert.fail( "expected a compilation error")
    assert.equal(result.errors[0].type, expected);
}

export function runtimeError(code: string, expected: RuntimeErrorType, call?: string) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code, call);
    if(result.errors.length != 0) {
        console.table(result.errors)
        assert.fail(`Compilation error: ${result.errors[0].message}`)
    }
    assert.equal(last(result.trace).error?.type, expected);
}

export function cases(code: string, ...tests: [string, any][]) {
    const interpreter = new Interpreter();
    tests.forEach(t => {
        const result = interpreter.parseAndRun(code, t[0]);
        if(result.errors.length != 0) {
            console.table(result.errors)
            assert.fail(`Compilation error: ${result.errors[0].message}`)
        }
        assert.deepStrictEqual(result.result.evaluation, t[1]);
    })
}

export function script(code: string, cases: Map<string, any>) {
    const interpreter = new Interpreter();
    let result = interpreter.parseAndRun(code);
    if(result.errors.length != 0) {
        console.table(result.errors)
        assert.fail("error: " + result.errors[0].message)
    }
    if (last(result.trace)?.error)
        assert.fail(last(result.trace)?.error?.message)
    else {

        const mapToObj = (m:Map<any, any>) =>
            Object.fromEntries([...m.entries()]);

        const evaluationMap = new Map([...last(result.trace).stack[0].variables].map(
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
}