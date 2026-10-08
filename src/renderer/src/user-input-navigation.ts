import { validateUserInput, type UserInputField, type UserInputValue } from "../../shared/user-input";

export function validateQuestion(
  fields: UserInputField[], values: Record<string, UserInputValue>, index: number,
) {
  const field = fields[index];
  return validateUserInput(
    [field], values[field.id] === undefined ? {} : { [field.id]: values[field.id] },
  );
}

export function firstInvalidQuestionIndex(
  fields: UserInputField[], values: Record<string, UserInputValue>,
): number {
  return fields.findIndex((_, index) => !validateQuestion(fields, values, index).ok);
}
