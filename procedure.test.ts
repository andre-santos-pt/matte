import {
    CompilationErrorType,
    Interpreter,
    RuntimeErrorType
} from './src/Interpreter';
import assert from "assert";


function last<T>(arr: T[]): T {
    return arr[arr.length - 1];
}

function script(code: string, cases: Map<string, any>) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code);
    if (last(result.trace)?.error)
        assert.fail(last(result.trace)?.error?.message)
    else {
        const evaluationMap = new Map([...last(result.trace).stack[0].variables].map(
            ([name, variable]) => [name, variable.evaluation]
        ))
        try {
            assert.deepStrictEqual(evaluationMap, cases, evaluationMap.toString());
        } catch (returnObj) {
            console.table(evaluationMap);
            throw returnObj
        }
    }
}

function compilationError(code: string, expected: CompilationErrorType) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code);
    assert.equal(result.errors[0].type, expected);
}

function scriptError(code: string, expected: RuntimeErrorType) {
    const interpreter = new Interpreter();
    const result = interpreter.parseAndRun(code);
    assert.equal(last(result.trace).error?.type, expected);
}

describe('Matte Interpreter Test Procedure', () => {
    describe('Independent', () => {

        it('no args', () => {
            let code = `
            int noargs() {
                int i = 10;
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return z;
            }            
            `
            const interpreter = new Interpreter();
            const result = interpreter.parseAndRun(code, "noargs()");
            assert.equal(result.result.evaluation, 80);
        })

        it('one arg', () => {
            let code = `
            int oneArg(int i) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return z;
            }            
            `
            const interpreter = new Interpreter();
            const result = interpreter.parseAndRun(code, "oneArg(10)");
            assert.equal(result.result.evaluation, 80);
        })

        it('two args', () => {
            let code = `
            int twoArgs(int i, int k) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + k;
                return z;
            }            
            `
            const interpreter = new Interpreter();
            const result = interpreter.parseAndRun(code, "twoArgs(10, 50)");
            assert.equal(result.result.evaluation, 80);
        })
    })
})
