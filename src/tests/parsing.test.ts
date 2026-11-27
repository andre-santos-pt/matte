import {StaticErrorType} from "../ast";

import assert from "assert";
import {JavaCompiler} from "../antlr2ast";
import {compileAssert} from "./utils";

describe('Matte Interpreter Test Parsing', () => {
    describe('Parsing', () => {
        it('missing semi-colon', () => {
            const src = `
            int i = 0
            `
            const res = new JavaCompiler().compile(src)
            assert.equal(res.errors[0].type, StaticErrorType.MissingToken)
            assert.equal(res.errors[0].detail.missing, ";")
        })

        it('missing curly-brace', () => {
            const src = `
            void f() {
            
            
            `
            const res = new JavaCompiler().compile(src)
            assert.equal(res.errors[0].type, StaticErrorType.MissingToken)
            assert.equal(res.errors[0].detail.missing, "}")
        })

        it('malformed call', () => {
            const compilation = compileAssert( `
            int f(int n) {
                return n + 1;
            }
            `)
            const res = new JavaCompiler().compileCall(compilation, "f(2");
            assert.equal(res?.type, StaticErrorType.MissingToken)
        })

        it('call not found', () => {
            const compilation = compileAssert( `
            int f(int n) {
                return n + 1;
            }
            `)
            const res = new JavaCompiler().compileCall(compilation, "g(2)");
            assert.equal(res?.type, StaticErrorType.MethodNotFound)
        })

        it('malformed call trailing', () => {
            const compilation = compileAssert( `
            int f(int n) {
                return n + 1;
            }
            `)
            const res = new JavaCompiler().compileCall(compilation, "g(2)");
            assert.equal(res?.type, StaticErrorType.SyntaxError)
        })

        it('wrong args call', () => {
            const compilation = compileAssert( `
            int f(int n) {
                return n + 1;
            }
            `)
            const res = new JavaCompiler().compileCall(compilation, "g(2)");
            assert.equal(res?.type, StaticErrorType.NumberArgumentsMismatch)
        })

        it('visit all', () => {
            const src = `
            class X {
                void foo() {
                    int i = 0;
                }
                int bar() {
                    return 1;
                }
            }
            `
            const program = new JavaCompiler().compile(src)
        })
    })


})
