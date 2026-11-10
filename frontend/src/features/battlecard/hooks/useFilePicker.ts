import { useCallback, useRef } from "react";

/** Id of the single hidden file input of the console (owned by AttachmentPicker). */
export const FILE_INPUT_ID = "battlecard-file-input";

/**
 * Opens the console's hidden file input. The form's drop zone and the chat's paperclip button share one
 * input, so selected files always go through the same validation path.
 */
export function useFilePicker() {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const open = useCallback(() => {
        const input = inputRef.current ?? (document.getElementById(FILE_INPUT_ID) as HTMLInputElement | null);
        input?.click();
    }, []);

    return { inputRef, open };
}
