export type UserInputValue = string | number | boolean | string[];

export type UserInputField = {
  id: string;
  label: string;
  description?: string;
  type: "text" | "choice" | "multiChoice" | "number" | "boolean";
  required: boolean;
  options?: { label: string; value: string; description?: string }[];
  allowOther?: boolean;
  integer?: boolean;
  secret?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  defaultValue?: UserInputValue;
};

export type UserInputRequest = {
  requestId: string;
  title: string;
  source: "agent" | "codex" | "mcp";
  sourceName?: string;
  fields: UserInputField[];
  agentName?: string;
};

export function withoutUserInputDefaults(request: UserInputRequest): UserInputRequest {
  return {
    ...request,
    fields: request.fields.map(({ defaultValue: _defaultValue, ...field }) => field),
  };
}

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
const short = (value: unknown, max = 500): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function agentInputFields(raw: unknown): UserInputField[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) return null;
  const fields = raw.map((item, index): UserInputField | null => {
    const q = record(item);
    if (!q) return null;
    const label = short(q.question);
    if (!label) return null;
    const id = q.id === undefined ? `question_${index + 1}` : q.id;
    if (typeof id !== "string" || id.length > 100 || !/^[a-zA-Z][\w-]*$/.test(id)) return null;
    const choices = q.options ?? undefined;
    if (choices !== undefined && (!Array.isArray(choices) || choices.length < 2 || choices.length > 6)) return null;
    const options = Array.isArray(choices) ? choices.map((option) => {
      const data = record(option);
      const name = short(data?.label, 100);
      return name ? { label: name, value: name, description: short(data?.description, 200) } : null;
    }) : undefined;
    if (options?.some((option) => !option)) return null;
    return {
      id,
      label,
      description: short(q.header, 80) || undefined,
      type: options ? "choice" : "text",
      required: true,
      options: options as UserInputField["options"],
      allowOther: !!options && q.isOther === true,
      secret: q.isSecret === true,
    };
  });
  if (fields.some((field) => !field)) return null;
  const result = fields as UserInputField[];
  return new Set(result.map((field) => field.id)).size === result.length ? result : null;
}

export function mcpInputFields(raw: unknown): UserInputField[] | null {
  const schema = record(raw);
  const properties = record(schema?.properties);
  if (schema?.type !== "object" || !properties) return null;
  const entries = Object.entries(properties);
  if (entries.length < 1 || entries.length > 8) return null;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.some((id) => typeof id !== "string" || !(id in properties))) return null;
  const fields = entries.map(([id, rawProperty]): UserInputField | null => {
    const property = record(rawProperty);
    if (!property || !id || id.length > 100) return null;
    const base = {
      id,
      label: short(property.title, 120) || id,
      description: short(property.description, 300) || undefined,
      required: required.includes(id),
    };
    if (property.type === "string") {
      if (property.format && !["email", "uri", "date", "date-time"].includes(String(property.format))) return null;
      if (property.enum !== undefined || property.oneOf !== undefined) {
        const options = enumOptions(property, "oneOf");
        if (!options) return null;
        return {
          ...base,
          type: "choice",
          options,
          defaultValue: typeof property.default === "string" ? property.default : undefined,
        };
      }
      return {
        ...base,
        type: "text",
        minLength: typeof property.minLength === "number" ? property.minLength : undefined,
        maxLength: typeof property.maxLength === "number" ? property.maxLength : undefined,
        defaultValue: typeof property.default === "string" ? property.default : undefined,
      };
    }
    if (property.type === "array") {
      const items = record(property.items);
      const options = items ? enumOptions(items, "anyOf") ?? enumOptions(items, "oneOf") : null;
      if (!options || (property.minItems !== undefined && typeof property.minItems !== "number") ||
        (property.maxItems !== undefined && typeof property.maxItems !== "number")) return null;
      return {
        ...base,
        type: "multiChoice",
        options,
        minItems: typeof property.minItems === "number" ? property.minItems : undefined,
        maxItems: typeof property.maxItems === "number" ? property.maxItems : undefined,
        defaultValue: Array.isArray(property.default) && property.default.every((value) => typeof value === "string")
          ? property.default as string[] : undefined,
      };
    }
    if (property.type === "number" || property.type === "integer") {
      return {
        ...base,
        type: "number",
        integer: property.type === "integer",
        min: typeof property.minimum === "number" ? property.minimum : undefined,
        max: typeof property.maximum === "number" ? property.maximum : undefined,
        defaultValue: typeof property.default === "number" ? property.default : undefined,
      };
    }
    if (property.type === "boolean") {
      return { ...base, type: "boolean", defaultValue: typeof property.default === "boolean" ? property.default : undefined };
    }
    return null;
  });
  return fields.some((field) => !field) ? null : fields as UserInputField[];
}

function enumOptions(property: RecordLike, titledKey: "oneOf" | "anyOf"):
  UserInputField["options"] | null {
  if (Array.isArray(property.enum)) {
    if (property.enum.length < 1 || property.enum.length > 20 ||
      property.enum.some((value) => typeof value !== "string")) return null;
    const names = Array.isArray(property.enumNames) && property.enumNames.length === property.enum.length
      ? property.enumNames : property.enum;
    if (names.some((value: unknown) => typeof value !== "string")) return null;
    return (property.enum as string[]).map((value, index) => ({ value, label: short(names[index], 100) }));
  }
  const choices = property[titledKey];
  if (!Array.isArray(choices) || choices.length < 1 || choices.length > 20) return null;
  const options = choices.map((choice) => {
    const item = record(choice);
    return typeof item?.const === "string" && typeof item.title === "string"
      ? { value: item.const, label: short(item.title, 100) } : null;
  });
  return options.some((option) => !option) ? null : options as NonNullable<UserInputField["options"]>;
}

export function validateUserInput(
  fields: UserInputField[], raw: unknown,
): { ok: true; values: Record<string, UserInputValue> } | { ok: false; error: string } {
  const input = record(raw);
  if (!input || Object.keys(input).some((id) => !fields.some((field) => field.id === id))) {
    return { ok: false, error: "Invalid answer fields." };
  }
  const values: Record<string, UserInputValue> = {};
  for (const field of fields) {
    const value = input[field.id];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0 && field.required)) {
      if (field.required) return { ok: false, error: `Answer ${field.label}.` };
      continue;
    }
    if (field.type === "multiChoice") {
      if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" ||
        !field.options?.some((option) => option.value === item)) || new Set(value).size !== value.length ||
        (field.minItems !== undefined && value.length < field.minItems) ||
        (field.maxItems !== undefined && value.length > field.maxItems)) {
        return { ok: false, error: `Choose valid options for ${field.label}.` };
      }
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") return { ok: false, error: `Invalid answer for ${field.label}.` };
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || (field.integer && !Number.isInteger(value)) ||
        (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
        return { ok: false, error: `Invalid number for ${field.label}.` };
      }
    } else {
      if (typeof value !== "string" || value.length > 4000 ||
        (field.minLength !== undefined && value.length < field.minLength) ||
        (field.maxLength !== undefined && value.length > field.maxLength)) {
        return { ok: false, error: `Invalid answer for ${field.label}.` };
      }
      if (field.type === "choice" && !field.allowOther && !field.options?.some((option) => option.value === value)) {
        return { ok: false, error: `Choose an option for ${field.label}.` };
      }
    }
    values[field.id] = value as UserInputValue;
  }
  return { ok: true, values };
}

export function codexInputResponse(fields: UserInputField[], values: Record<string, UserInputValue> | null): {
  answers: Record<string, { answers: string[] }>;
} {
  return {
    answers: Object.fromEntries(fields
      .filter((field) => values?.[field.id] !== undefined)
      .map((field) => [field.id, { answers: [String(values![field.id])] }])),
  };
}

export function mcpInputResponse(values: Record<string, UserInputValue> | null):
  { action: "cancel" } | { action: "accept"; content: Record<string, UserInputValue> } {
  return values === null ? { action: "cancel" } : { action: "accept", content: values };
}
