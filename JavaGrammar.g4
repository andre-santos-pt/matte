grammar JavaGrammar;

unit: (class | record | method)+ | script EOF ;

script: statement+ EOF ;

class: CLASS id+=ID+ LCURLY? member* RCURLY?;

member: method | field;

record: RECORD id=ID LPAREN params RPAREN LCURLY method* RCURLY;

field: type=ID id=ID (ASSIGN expression=exp)? TERM?;

method: type=ID arrayDim* id=ID LPAREN params? RPAREN LCURLY statement* RCURLY? ;

//constructor: modifiers+=ID* id=ID LPAREN params? RPAREN LCURLY? statement* RCURLY?;

params: param (COMMA param)* ;

param: type=ID? arrayDim* id=ID;


arrayDim: LBRACK RBRACK;

statement:
LCURLY statement* RCURLY  #BlockStmt
| if                     #IfElseStmt
| while                    #WhileStmt
| for                       #ForStmt
| ((declaration | assignment | arrayAssignment | inc | dec | return | break | call | instanceCallStatement) TERM?) #Stmt
//| nop
;

if: IF ((LPAREN expression=exp? RPAREN)|expression=exp) ifcase=statement (ELSE elsecase=statement)?;

while: WHILE ((LPAREN expression=exp? RPAREN)|expression=exp) statement ;

for: FOR LPAREN declaration? TERM expression=exp? TERM progress=statement? RPAREN body=statement ;

declaration: type=ID arrayDim* id=ID (ASSIGN expression=exp)?;

assignment: id=compId ASSIGN expression=exp;

arrayAssignment: target=exp LBRACK index=exp RBRACK ASSIGN expression=exp;

inc: target=exp INC;

dec: target=exp DEC;

return: RETURN expression=exp?;

call: id=ID LPAREN args=expList? RPAREN;

break: BREAK;

nop: TERM;

expList: exp (COMMA exp)*;

compId: ID (DOT ID)*;

exp:
    LPAREN exp RPAREN                           # bracketsExpr

    | target=exp LBRACK index=exp RBRACK        # arrayExpr
    | newCall                                   # objectAllocExpr
    | target=exp DOT fieldId=ID                 # fieldExpr
    | uop target=exp                            # unaryOp
    | left=exp bopMul right=exp                 # binaryOpMul
    | left=exp bopAdd right=exp                 # binaryOpAdd
    | left=exp bopRel right=exp                 # binaryOpRel
    | left=exp bopLog right=exp                 # binaryOpLog
    | call                                      # callExpr
    | condition=exp QUESTION trueCase=exp COLON falseCase=exp #conditionalExpr
    | left=exp AND right=exp                    # andExpr
    | left=exp OR right=exp                     # orExpr
    | LCURLY elements=expList? RCURLY           # arrayLitExpr
    | NEW type=ID dimensions                    # arrayAllocExpr
    | exp DOT call                              # instanceCallExpr
    | ID                                        # idExpr
    | INT                                       # intExpr
    | DOUBLE                                    # doubleExpr
    | BOOLEAN                                   # boolExpr
    | CHAR                                      # charExpr
    | NULL                                      # nullExpr
    | STRING                                    # stringExpr
;

newCall:
    NEW type=ID LPAREN args=expList? RPAREN;

instanceCallStatement:
    exp DOT call;

dimensions:
    LBRACK exp? RBRACK
;

uop: NOT | MINUS;

bopMul:
MULT | DIV | MOD;

bopAdd:
PLUS | MINUS;

bopRel:
EQ | NEQ
|GT  | GTE | LT | LTE |
|GTE_MIS | LTE_MIS;

bopLog:
AND | OR;

PLUS: '+' ;
MINUS: '-' ;
MULT: '*' ;
DIV: '/' ;
MOD: '%' ;

LPAREN: '(' ;
RPAREN: ')' ;

LCURLY: '{' ;
RCURLY: '}' ;

LBRACK: '[' ;
RBRACK: ']' ;

ASSIGN: '=' ;

PLUS_ASSIGN: '+=' ;

PLUS_ASSIGN_MIS: '=+' ;

EQ: '==' ;
NEQ: '!=' ;
NEQ_MIS: '=!' ;

GT: '>' ;
GTE: '>=' ;
GTE_MIS: '=>' ;

LT: '<' ;
LTE: '<=' ;
LTE_MIS: '=<' ;

NOT: '!' ;
AND: '&&';
OR: '||';

COMMA: ',' ;
TERM: ';' ;

QUESTION: '?';

COLON: ':';

DOT: '.';

BOOLEAN: 'true'|'false';

CLASS: 'class';

RECORD: 'record';

IF: 'if';

ELSE: 'else';

WHILE: 'while';

FOR: 'for';

RETURN: 'return';

BREAK: 'break';

NEW: 'new';

INC: '++';
DEC: '--';

NULL: 'null';

INT: [0-9]+;

DOUBLE: [0-9]* '.' [0-9]+;

CHAR: '\''.'\'';

ID: [a-zA-Z][a-zA-Z0-9_]*;

STRING: '"'~([\n"])*'"';

LINE_COMMENT: '//'~('\n'|'\r')*('\n'|'\r\n') -> channel(HIDDEN);

WS: [ \t\r\n]+ -> channel(HIDDEN) ;

