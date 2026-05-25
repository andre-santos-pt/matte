import {cases, compilationError} from "./utils";
import {CompilationErrorType} from "../Interpreter";

describe('Matte Interpreter Test Procedure', () => {
    describe('Independent', () => {
        it('no args', () => {
            cases(`
            int noargs() {
                int i = 10;
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return z;
            }            
            `,
                ["noargs()", 80]);
        })

        it('method not found', () => {
            compilationError(`
            int noargs() {
                int i = 10;
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return nop();
            }            
            `,
               CompilationErrorType.MethodNotFound);
        })

        it('one arg', () => {
            cases(`
            int oneArg(int i) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return z;
            }            
            `,
                ["oneArg(10)", 80],
                ["oneArg(0]", 70])
        })

        it('two args', () => {
            cases(`
            int twoArgs(int i, int k) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + k;
                return z;
            }            
            `,
                ["twoArgs(10, 50)", 80])
        })
    })


    describe('Recursive', () => {
        it('fact', () => {
            cases(`
            int f(int n) {
                if(n == 1) return 1;
                else return n * f(n-1);
            }`,
                ["f(1)", 1],
                ["f(5)", 120])
        })
    })


})
