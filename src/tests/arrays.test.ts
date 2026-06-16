import {
    CompilationErrorType,
    RuntimeErrorType
} from '../Interpreter';

import {cases, compilationError, runtimeError, script} from "./utils";

describe('Matte Interpreter Test Arrays', () => {
    describe('Script', () => {
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
    })
    describe('Functions', () => {

        it('sum', () =>{
            cases(`int sum(int[] a) {
                int s = 0;
                int i = 0;
                while(i < a.length) {
                    s = s + a[i];
                    i++;
                }
                return s;
            }`,
                ["sum({1,2,3}",6],
                ["sum({}",0])
        })
        }
    )
})
