import {RuntimeErrorType} from '../Interpreter';

import {cases, compilationError, runtimeError, script} from "./utils";
import {
    ArrayType,
    Declaration, isSameType,
    PrimitiveType,
    Program,
    StaticErrorType
} from "../ast";
import assert from "assert";

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

        it('empty array type', () => {
            const p = script(`
        int[] a = {};
        `, new Map()
                .set("a", [])
            ) as Program
            const dec = p.block?.statements[0] as Declaration
            assert.ok(isSameType(dec.initializer?.type, new ArrayType(PrimitiveType.INT)))
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
        `, StaticErrorType.TypeMismatch)
        });

        it('index type', () => {
            compilationError(`
        int[] array = new int[2];
        array[2.1] = 10;
        `, StaticErrorType.TypeMismatch)
        });

        it('assign type', () => {
            compilationError(`
        int[] array = new int[2];
        array[0] = 10.3;
        `, StaticErrorType.TypeMismatch)
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
        `, StaticErrorType.TypeMismatch)
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
            }
            
            double avg(int[] array) {
                return sum(array) / (array.length * 1.0);
            }
            `,
                ["sum({1,2,3})",6],
                ["sum({})",0],
                ["avg({1,2})", 1.5])
        })

        it('null return', () =>{
            cases(`int[] test(int[] a) {
                if(a == null)
                    return null;
                else
                    return new int[a.length];
            }
            `,
                ["test(null)",null],
                ["test({})",[]],
                ["test({1,2,3})", [0,0,0]])
        })
        }
    )
})
