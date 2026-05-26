import {
    CompilationErrorType,
    Interpreter,
    RuntimeErrorType
} from '../Interpreter';
import assert from "assert";

import {compilationError, runtimeError} from "./utils";
import {last} from "../utils";

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


describe('Matte Interpreter Test Script', () => {
    // Group 1: Basic functionality
    describe('Script', () => {

        it('script mode', () => {
            script(`
        int i = 10;
        int j = i + 5;
        j = j + 5;
        int z = i + j + 50;
        `, new Map()
                .set("i", 10)
                .set("j", 20)
                .set("z", 80)
            )
        });

        it('var not found assign', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        x = j + 5;
        int z = i + j + 50;
        `, CompilationErrorType.UndeclaredVariable)
        });

        it('var not found exp', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        j = a + 5;
        int z = i + j + 50;
        `, CompilationErrorType.UndeclaredVariable)
        });


        it('var not found exp', () => {
            compilationError(`
        int i = 10;
        int j = i + 5;
        int i = j + 5;
        `, CompilationErrorType.DuplicateVariable)
        });


        it('operation types error', () => {
            compilationError(`
        int i = 10;
        boolean j = true;
        int x = j + i;
        `, CompilationErrorType.TypeMismatch)
        });

        it('if', () => {
            script(`
        int n = -2;
        if(n < 0) {
            n = -n;
        }
        `, new Map().set("n", 2))
        });

        it('if-else', () => {
            script(`
        int n = -2;
        if(n > 0) {
            n = -n;
        }
        else
            n = 0;
        `, new Map().set("n", 0))
        });

        it('while', () => {
            script(`
        int i = 0;
        while(i != 10) {
            i = i + 1;
        }
        `, new Map().set("i", 10))
        });

        it('while loop max', () => {
            runtimeError(`
        int i = 0;
        while(i != 101) {
            i = i + 1;
        }
        `, RuntimeErrorType.MaxIterationsReached)
        });

        it('inc while', () => {
            script(`
        int i = 0;
        while(i != 10) {
            i++;
        }
        `, new Map().set("i", 10))
        });


        it('inc array', () => {
            script(`
        int[] array = {5,6,7};
        int i = 0;
        while(i != array.length) {
            array[i]++;
            i++;
        }
        `, new Map()
                .set("i", 3)
                .set("array", [6, 7, 8])
            )
        });

        it('for', () => {
            script(`
        for(int i = 0; i != 10; i = i + 1) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for inc', () => {
            script(`
        for(int i = 0; i != 10; i++) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for no init', () => {
            script(`
        int i = 0;
        for(; i != 10; i = i + 1) {
        
        }
        `, new Map().set("i", 10))
        });

        it('for no prog', () => {
            script(`
        int i = 0;
        for(; i != 10; ) {
            i = i + 1;
        }
        `, new Map().set("i", 10))
        });

        it('nested for', () => {
            script(`
        int c = 0;
        for(int i = 0; i != 10; i++)
            for(int j = 0; j != 20; j++)
                c++;
        `, new Map()
                .set("c", 200)
                .set("i", 10)
                .set("j", 20))
        });

        it('array access', () => {
            script(`
        int[] array = {5,6,7};
        int a = array[0];
        int b = array[1];
        int c = array[2];
       
        `, new Map()
                .set("a", 5)
                .set("b", 6)
                .set("c", 7)
                .set("array", [5, 6, 7])
            )
        });

        it('array length', () => {
            script(`
        int[] a = {5,6,7};
        int[] b = {};
        int aLen = a.length;
        int bLen = b.length;
        
        `, new Map()
                .set("aLen", 3)
                .set("bLen", 0)
                .set("a", [5, 6, 7])
                .set("b", [])
            )
        });

        it('array write', () => {
            script(`
        int[] array = new int[5];
        array[0] = 10;
        array[2] = 20;
        array[4] = 40;
       
        `, new Map()
                .set("array", [10, 0, 20, 0, 40])
            )
        });

        it('array write null pointer', () => {
            runtimeError(`
        int[] array = null;
        array[5] = 10;
        `, RuntimeErrorType.NullPointer)
        });

        it('array write access type', () => {
            compilationError(`
        int array = 4;
        array[5] = 10;
        `, CompilationErrorType.TypeMismatch)
        });

        it('array write invalid index', () => {
            runtimeError(`
        int[] array = new int[5];
        array[5] = 10;
        `, RuntimeErrorType.ArrayIndexOutOfBounds)
        });

        it('array access type', () => {
            compilationError(`
        int a = 0;
        int b = a[1];
        `, CompilationErrorType.TypeMismatch)
        });

        it('array invalid index', () => {
            runtimeError(`
         int[] array = {5,6,7};
         int a = array[4];
        `, RuntimeErrorType.ArrayIndexOutOfBounds)
        });
    })
})
