
import {cases, compilationError} from "./utils";
import {compile} from "../antlr2ast";
import {StaticErrorType, Program, Procedure, PrimitiveType} from "../ast";
import assert from "assert";

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
        `, StaticErrorType.TypeMismatch
            )
        });

        it('mismatch init', () => {
            compilationError(`
        boolean i = 10;
        `, StaticErrorType.TypeMismatch
            )
        });

        it('mismatch var', () => {
            compilationError(`
        int i = 10;
        i = 1.2;
        `, StaticErrorType.TypeMismatch
            )
        });

        it('mismatch not', () => {
            compilationError(`
        int i = 10;
        boolean j = !i;
        `, StaticErrorType.TypeMismatch
            )
        });

        it('if guard', () => {
            compilationError(`
        int i = 10;
        if(i) 
            i = 0;
        `, StaticErrorType.TypeMismatch
            )
        });

        it('while guard', () => {
            compilationError(`
        int i = 10;
        while(i) 
            i--;
        `, StaticErrorType.TypeMismatch
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
        `, StaticErrorType.TypeMismatch, "f()"
            )
        });

        it('array type', () => {
            compilationError(`
            int[] arr = 10;
        `, StaticErrorType.TypeMismatch
            )
        });

        it('return type mismatch', () => {
            compilationError(`
                int f() {
                    return true;
                }
            `, StaticErrorType.TypeMismatch, "f()"
            )
        })
        it('return type void mismatch', () => {
            compilationError(`
                void f() {
                    return 10;
                }
            `, StaticErrorType.TypeMismatch, "f()"
            )
        })

        it('void return', () => {
            const p = compile(`
                void f() {
                   
                }`) as Program
            assert.equal(p.procedures[0].returnType, PrimitiveType.VOID)
        })

        it('non-void function missing return', () => {
            compilationError(`
                int f(boolean condition) {
                    if (condition) return 1;
                }
            `, StaticErrorType.MissingReturn)
        })

        it('non-void function returns on every branch', () => {
            const p = compile(`
                int f(boolean condition) {
                    if (condition) return 1;
                    else return 2;
                }
            `)
            assert.ok(p instanceof Program)
        })

        it('void return mismatch', () => {
            compilationError(`
            void f() {
                return 10;
            }
        `, StaticErrorType.TypeMismatch, "f()"
            )
        })

        it('void return nothing', () => {

            const src = `void f() {
                int i = 0;
                i++;
                return;
            }`

            compile(src)

            cases(src, ["f()", undefined])

        })




    })
})