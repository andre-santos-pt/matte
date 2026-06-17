
import {compilationError} from "./utils";
import {compile} from "../antlr2ast";
import {CompilationErrorType, Program} from "../ast";

describe('Matte Interpreter Types', () => {
    describe('Script', () => {

        it('test', () => {
            const p = compile(`
                int i = 10;
            `)
        });


        it('mismatch binary', () => {
            compilationError(`
        int i = 10;
        int j = i + true;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('mismatch init', () => {
            compilationError(`
        boolean i = 10;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('mismatch var', () => {
            compilationError(`
        int i = 10;
        i = 1.2;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('mismatch not', () => {
            compilationError(`
        int i = 10;
        boolean j = !i;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('if guard', () => {
            compilationError(`
        int i = 10;
        if(i) 
            i = 0;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('while guard', () => {
            compilationError(`
        int i = 10;
        while(i) 
            i--;
        `, CompilationErrorType.TypeMismatch
            )
        });

        it('mismatch call', () => {
            compilationError(`
            int g() {
                return 0;
            }
            
            int f() {
                if(g()) return -1;
                else return 1;
            }
        `, CompilationErrorType.TypeMismatch, "f()"
            )
        });

        it('array type', () => {
            compilationError(`
            int[] arr = 10;
        `, CompilationErrorType.TypeMismatch
            )
        });

    })
})