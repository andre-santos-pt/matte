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
               CompilationErrorType.MethodNotFound,
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
                CompilationErrorType.NumberArgumentsMismatch
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
                CompilationErrorType.ArgumentTypesMismatch
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
