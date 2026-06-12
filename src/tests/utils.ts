import {
    CompilationErrorType,
    Interpreter,
    RuntimeErrorType
} from "../Interpreter";
import assert from "assert";
import {last} from "../utils";

export function compilationError(code: string, expected: CompilationErrorType, call?: string) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code, call);
    if(result.errors.length == 0)
        assert.fail( "expected a compilation error")
    assert.equal(result.errors[0].type, expected);
}

export function runtimeError(code: string, expected: RuntimeErrorType) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code);
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