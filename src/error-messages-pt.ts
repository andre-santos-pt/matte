import {ErrorMessageHandler} from "./matte-ace-editor";
import {StaticError, StaticErrorType} from "./ast";
import {mark} from "./antlr2ast";

export class ErrorMessagesPt implements ErrorMessageHandler {

    transform(error: StaticError): StaticError {
        let message = error.message
        let detail = error.detail
        if(error.type == StaticErrorType.DuplicateVariable) {
            message = "Nome de variável duplicado"
        }
        else if(error.type == StaticErrorType.UndeclaredVariable) {
            message = "Variável não declarada"
            //detail.hint = "??"
        }
        else if(error.type == StaticErrorType.TypeMismatch) {
            message = "Tipo incompatível"
            if(error.detail.found && error.detail.expected)
                message += `: esta expressão é do tipo ${mark(error.detail.found)}, mas o esperado é ${mark(error.detail.expected)}`
        }
        else if(error.type == StaticErrorType.CannotInferType) {
            message = "Não é possível inferir o tipo da variável"
        }
        return {
            ...error,
            message,
            detail
        }
    }
}