import {StaticErrorType} from "../ast";

import {compile} from "../antlr2ast";
import assert from "assert";
import {Interpreter} from "../Interpreter";

describe('Matte Interpreter Test Parsing', () => {
    describe('Parsing', () => {
        it('missing semi-colon', () => {
            const src = `
            int i = 0
            `
            const res = compile(src)
            assert.equal(res.errors[0].type, StaticErrorType.MissingToken)
            assert.equal(res.errors[0].detail.missing, ";")
        })

        it('missing curly-brace', () => {
            const src = `
            void f() {
            
            
            `
            const res = compile(src)
            assert.equal(res.errors[0].type, StaticErrorType.MissingToken)
            assert.equal(res.errors[0].detail.missing, "}")
        })

        it('malformed call', () => {
            const src = `
            int f(int n) {
                return n + 1;
            }
            `
            const res = new Interpreter().parseAndRun(src, "f(2")
            assert.equal(res.callError?.type, StaticErrorType.MissingToken)
        })

        it('call not found', () => {
            const src = `
            int f(int n) {
                return n + 1;
            }
            `
            const res = new Interpreter().parseAndRun(src, "g(2)")
            assert.equal(res.callError?.type, StaticErrorType.MethodNotFound)
        })

        it('malformed call trailing', () => {
            const src = `
            int f(int n) {
                return n + 1;
            }
            `
            const res = new Interpreter().parseAndRun(src, "f(2)lalala")
            assert.equal(res.callError?.type, StaticErrorType.SyntaxError)
        })

        it('wrong args call', () => {
            const src = `
            int f(int n) {
                return n + 1;
            }
            `
            const res = new Interpreter().parseAndRun(src, "f(2, 1)")
            assert.equal(res.callError?.type, StaticErrorType.NumberArgumentsMismatch)
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
            const program = compile(src)

        })
    })


})
