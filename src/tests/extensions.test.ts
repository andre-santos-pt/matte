import {ExtensionProcedure, Interpreter,} from '../Interpreter';
import assert from "assert";
import {script} from "./utils";
import {PrimitiveType} from "../ast";

describe('Matte Interpreter Test Extensions', () => {
    describe('static', () => {
        it('println to console', () => {
            const originalLog = console.log;
            const logHistory: string[] = [];

            console.log = function (...args) {
                logHistory.push(...args.map(a => a.evaluation.toString()));
                originalLog.apply(console, args);
            };
            const interpreter = new Interpreter();
            interpreter.addExtensionProcedure(new ExtensionProcedure(args => {
                console.log(args[0])
                return {
                    evaluation: undefined,
                    materialization: undefined
                }}, PrimitiveType.VOID, "println"))
            interpreter.parseAndRun(`
                println(3);
                println(1);
                println("!!");
            `)
            assert.deepStrictEqual(logHistory, ["3","1","!!"])
        })

        it('list', () => {
            const interpreter = new Interpreter();
            interpreter.addExtensionType("List", new ExtensionProcedure(args => {
                return {
                    evaluation: [],
                    materialization: undefined
                }
            },undefined,undefined),
                new ExtensionProcedure(args => {
                    args[0].evaluation.push(args[1].evaluation)
                    return { evaluation: undefined, materialization: undefined }
                }, PrimitiveType.VOID, "add"),
                new ExtensionProcedure(args => {
                    return {evaluation: args[0].length, materialization: undefined}
                }, PrimitiveType.INT, "length"))

            interpreter.parseAndRun(`
             List list = new List();
                list.add(3);
                int len = list.length();
            `)

        })
    })
})
