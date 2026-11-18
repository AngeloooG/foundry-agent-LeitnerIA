import type { ReactNode } from "react";

interface FieldProps {
    /** Id of the form control rendered as child; links the label, help text and error to it. */
    controlId: string;
    label: string;
    required?: boolean;
    helpText?: string;
    error?: string;
    children: ReactNode;
}

/**
 * Labelled form field. The control passed as child must use `id={controlId}` and
 * `aria-describedby={describedBy(controlId, ...)}` (see {@link fieldDescribedBy}).
 */
export function Field({ controlId, label, required, helpText, error, children }: FieldProps) {
    return (
        <div className={error ? "field field--error" : "field"}>
            <label htmlFor={controlId}>
                {label}
                {required && (
                    <span className="required-indicator" aria-label="obligatorio">
                        {" "}*
                    </span>
                )}
            </label>

            {helpText && (
                <small className="field-help" id={`${controlId}-help`}>
                    {helpText}
                </small>
            )}

            {children}

            {error && (
                <span className="field-error" id={`${controlId}-error`} role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}

/** Builds the aria-describedby value for a control rendered inside {@link Field}. */
// eslint-disable-next-line react-refresh/only-export-components
export function fieldDescribedBy(controlId: string, hasHelp: boolean, hasError: boolean): string | undefined {
    const ids = [hasHelp && `${controlId}-help`, hasError && `${controlId}-error`].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
}
