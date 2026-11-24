import {
    ArithmeticExpression, ArrayAllocationExpression, ArrayAssignment,
    ArrayElementExpression, ArrayLiteralExpression,
    ArrayType, Assignment, BlockStatement, BooleanLiteral, BreakStatement,
    CallExpression, CallStatement, CastExpression, ConditionalExpression,
    Declaration, DoubleLiteral,
    Expression, FieldAccessExpression, ForeignType, IfStatement, IntLiteral,
    LogicalExpression, NewObjectExpression, NullLiteral, PrimitiveType,
    Procedure, Program, RelationalExpression,
    ReturnStatement, Statement, StaticErrorType, StringLiteral,
    Type,
    TypeDeclaration,
    typeName, UnaryExpression, UnboundCallExpression,
    UnboundNewObjectExpression, Variable, WhileStatement
} from "./ast";


export function getJavaCode(program: Program): string {
    if (program.block)
        return program.block.statements.map(statement => renderStatement(statement)).join("\n")

    const typeDeclarations = program.typeDeclarations.map(type => renderTypeDeclaration(program, type))
    const procedures = program.procedures
        .filter(procedure => !procedure.instance)
        .map(procedure => renderProcedure(procedure, false))

    return [...typeDeclarations, ...procedures].join("\n\n")
}

function renderType(type: Type): string {
    return typeName(type) ?? "Object"
}

function renderTypeDeclaration(program: Program, type: TypeDeclaration): string {
    const methods = program.procedures.filter(procedure =>
        procedure.instance && procedure.parameters[0]?.type === type
    )
    if (type.isRecord) {
        const fields = type.fields.map(field => `${renderType(field.type)} ${field.name}`).join(", ")
        const recordMethods = methods.filter(method => !isRecordAccessor(method, type.fields))
        const body = recordMethods.map(method => renderProcedure(method, true, 1)).join("\n\n")
        return `record ${type.name}(${fields}) {${body ? `\n${body}\n` : ""}}`
    }

    const members = [
        ...type.fields.map(field => `${renderIndent(1)}${renderDeclaration(field)};`),
        ...methods.map(method => renderProcedure(method, true, 1))
    ]
    return `class ${type.name} {${members.length ? `\n${members.join("\n\n")}\n` : ""}}`
}

function isRecordAccessor(procedure: Procedure, fields: Declaration[]): boolean {
    const field = fields.find(candidate => candidate.name === procedure.name)
    if (!field || procedure.parameters.length !== 1 || procedure.body?.statements.length !== 1)
        return false

    const statement = procedure.body.statements[0]
    return statement instanceof ReturnStatement &&
        statement.expression instanceof Variable &&
        statement.expression.declaration === field
}

function renderProcedure(procedure: Procedure, instance: boolean, indent = 0): string {
    const parameters = procedure.parameters
        .slice(instance ? 1 : 0)
        .map(parameter => `${renderType(parameter.type)} ${parameter.name}`)
        .join(", ")
    const returnType = procedure.returnType ? renderType(procedure.returnType) : "void"
    const body = procedure.body?.statements.map(statement => renderStatement(statement, indent + 1)).join("\n") ?? ""
    const prefix = renderIndent(indent)
    return `${prefix}${returnType} ${procedure.name}(${parameters}) {${body ? `\n${body}\n${prefix}` : ""}}`
}

function renderDeclaration(declaration: Declaration): string {
    const initializer = declaration.initializer ? ` = ${renderExpression(declaration.initializer)}` : ""
    return `${renderType(declaration.type)} ${declaration.name}${initializer}`
}

function renderStatement(statement: Statement, indent = 0): string {
    const prefix = renderIndent(indent)
    let code: string
    if (statement instanceof Declaration)
        code = `${prefix}${renderDeclaration(statement)};`
    else if (statement instanceof Assignment)
        code = `${prefix}${statement.variable.name} = ${renderExpression(statement.expression)};`
    else if (statement instanceof ArrayAssignment)
        code = `${prefix}${renderExpression(statement.target)}[${renderExpression(statement.index)}] = ${renderExpression(statement.expression)};`
    else if (statement instanceof BlockStatement) {
        const body = statement.statements.map(child => renderStatement(child, indent + 1)).join("\n")
        code = `${prefix}{${body ? `\n${body}\n${prefix}` : ""}}`
    } else if (statement instanceof IfStatement) {
        const thenBranch = renderBranch(statement.thenBranch, indent)
        const elseBranch = statement.elseBranch ? ` else ${renderBranch(statement.elseBranch, indent)}` : ""
        code = `${prefix}if (${renderExpression(statement.guard)}) ${thenBranch}${elseBranch}`
    } else if (statement instanceof WhileStatement)
        code = `${prefix}while (${renderExpression(statement.guard)}) ${renderBranch(statement.body, indent)}`
    else if (statement instanceof BreakStatement)
        code = `${prefix}break;`
    else if (statement instanceof ReturnStatement)
        code = `${prefix}return${statement.expression ? ` ${renderExpression(statement.expression)}` : ""};`
    else if (statement instanceof CallStatement)
        code = `${prefix}${renderExpression(statement.expression)};`
    else
        throw new Error(`Unsupported statement: ${statement.constructor.name}`)

    return statement.comment ? `${prefix}// ${statement.comment}\n${code}` : code
}

function renderBranch(statement: Statement, indent: number): string {
    if (statement instanceof BlockStatement)
        return renderStatement(statement, indent).trimStart()
    const inner = renderStatement(statement, indent + 1)
    return `{\n${inner}\n${renderIndent(indent)}}`
}

function renderExpression(expression: Expression): string {
    if (expression instanceof IntLiteral || expression instanceof DoubleLiteral)
        return String(expression.value)
    if (expression instanceof BooleanLiteral)
        return String(expression.value)
    if (expression instanceof StringLiteral) {
        const source = expression.range?.text
        if (source?.startsWith('"') && source.endsWith('"'))
            return source
        return JSON.stringify(expression.value)
    }
    if (expression instanceof NullLiteral)
        return "null"
    if (expression instanceof Variable)
        return expression.declaration.name
    if (expression instanceof ConditionalExpression)
        return `(${renderExpression(expression.condition)} ? ${renderExpression(expression.trueCase)} : ${renderExpression(expression.falseCase)})`
    if (expression instanceof CastExpression)
        return `(${expression.castType}) ${renderExpression(expression.expression)}`
    if (expression instanceof UnaryExpression)
        return `(${expression.operator}${renderExpression(expression.expression)})`
    if (expression instanceof ArithmeticExpression ||
        expression instanceof RelationalExpression ||
        expression instanceof LogicalExpression)
        if(expression.parent && expression.parent instanceof Expression)
            return `(${renderExpression(expression.left)} ${expression.operator} ${renderExpression(expression.right)})`
        else
            return `${renderExpression(expression.left)} ${expression.operator} ${renderExpression(expression.right)}`
    if (expression instanceof ArrayLiteralExpression)
        return `{${expression.elements.map(renderExpression).join(", ")}}`
    if (expression instanceof ArrayAllocationExpression)
        return `new ${renderType(expression.componentType)}${expression.dimensions.map(dimension => `[${renderExpression(dimension)}]`).join("")}`
    if (expression instanceof ArrayElementExpression)
        return `${renderExpression(expression.target)}[${renderExpression(expression.index)}]`
    if (expression instanceof CallExpression) {
        const args = expression.instanceCall ? expression.args.slice(1) : expression.args
        const receiver = expression.instanceCall && expression.args[0]
            ? `${renderExpression(expression.args[0])}.`
            : ""
        return `${receiver}${expression.procedure.name}(${args.map(renderExpression).join(", ")})`
    }
    if (expression instanceof UnboundCallExpression) {
        const args = expression.isInstance ? expression.args.slice(1) : expression.args
        const receiver = expression.isInstance && expression.args[0]
            ? `${renderExpression(expression.args[0])}.`
            : ""
        return `${receiver}${expression.procedureName}(${args.map(renderExpression).join(", ")})`
    }
    if (expression instanceof NewObjectExpression)
        return `new ${typeName(expression.type)}(${expression.args.map(renderExpression).join(", ")})`
    if (expression instanceof UnboundNewObjectExpression)
        return `new ${expression.typeName}(${expression.args.map(renderExpression).join(", ")})`
    if (expression instanceof FieldAccessExpression)
        return `${renderExpression(expression.target)}.${expression.fieldName}`

    throw new Error(`Unsupported expression: ${expression.constructor.name}`)
}

function renderIndent(indent: number): string {
    return "    ".repeat(indent)
}