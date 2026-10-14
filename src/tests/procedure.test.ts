import {cases, compilationError, runtimeError} from "./utils";
import {StaticErrorType} from "../ast";
import {buildASTandCall} from "../antlr2ast";
import {Interpreter, RuntimeErrorType} from "../Interpreter";

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
                StaticErrorType.MethodNotFound,
                "noargs()");
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
                ["oneArg(0)", 60])
        })

        it('missing one arg', () => {
            compilationError(`
            int oneArg(int i) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + 50;
                return z;
            }
            
            void main() {
                oneArg();
            }
            `,
                StaticErrorType.NumberArgumentsMismatch
            )
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

        it('arg types mismatch', () => {
            compilationError(`
            int twoArgs(int i, int k) {
                int j = i + 5;
                j = j + 5;
                int z = i + j + k;
                return z;
            }          
            
            void main() {
                twoArgs(true, 3);
            }
            `,
                StaticErrorType.ArgumentTypesMismatch
            )
        })

        it('isDigit', () => {
            cases(`
            boolean isDigit(int n) {
                return n >= 0 && n <=9;
            }            
            `,
                ["isDigit(4)", true],
                ["isDigit(10)", false],
                ["isDigit(-1)", false],
            )
        })

        it('isNotDigit', () => {
            cases(`
            boolean isNotDigit(int n) {
                return n < 0 || n > 9;
            }            
            `,
                ["isNotDigit(4)", false],
                ["isNotDigit(10)", true],
                ["isNotDigit(-1)", true],
            )
        })

        it('isNotDigitNeg', () => {
            cases(`
            boolean isDigit(int n) {
                return n >= 0 && n <=9;
            }  
            
            boolean isNotDigit(int n) {
                return !isDigit(n);
            }            
            `,
                ["isNotDigit(4)", false],
                ["isNotDigit(10)", true],
                ["isNotDigit(-1)", true],
            )
        })

    })

    describe('Errors', () => {
        it('stackoverflow', () => {
            runtimeError(
                `
            int a() {
                return b();
            }
            int b() {
                return c();
            }
            int c() {
                return d();
            }
            int d() {
                return 10;
            }
            `,
                RuntimeErrorType.StackOverflow,
                "a()",
                new Interpreter(100, 3))
        })

        it('near stackoverflow', () => {
            cases(
                `
            int t(int n) {
                if(n == 50)
                    return 50;
                else
                    return t(n+1);
            }
            `,
                ["t(0)", 50]
            )
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
        it('fact stackoverflow', () => {
            runtimeError(`
            int f(int n) {
                return n * f(n-1);
            }`,
                RuntimeErrorType.StackOverflow,
                "f(5)",
                new Interpreter(100, 5))
        })
    })

    describe('Other', () => {
        it('call matte', () => {
            const code = `
            int[] v = {1,2,3};
            `
            buildASTandCall(code,"sum()")
        })
    })

})
