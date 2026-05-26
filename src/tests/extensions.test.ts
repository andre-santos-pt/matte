import {Interpreter,} from '../Interpreter';
import assert from "assert";

describe('Matte Interpreter Test Extensions', () => {
    describe('Collections', () => {
        it('console static', () => {
            const originalLog = console.log;
            const logHistory: string[] = [];

            console.log = function (...args) {
                logHistory.push(...args.map(a => a.toString()));
                originalLog.apply(console, args);
            };
            const interpreter = new Interpreter();
            interpreter.addExtensionFunction("print", args => {
                console.log(args[0])
                return {
                    evaluation: undefined,
                    materialization: undefined
                }
            })
            interpreter.parseAndRun(`
                print(3);
                print(1)
            `)
            assert.deepStrictEqual(logHistory, ["3","1"])
        })
    })
})
