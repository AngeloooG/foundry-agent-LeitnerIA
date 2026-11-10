import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 120;

/**
 * Keeps a scroll container pinned to the bottom while content streams in, unless the user has scrolled up
 * to read earlier messages (then it does not steal the scroll position).
 *
 * @param trigger value that changes when new content arrives (e.g. message count + last message length)
 */
export function useAutoScroll<T extends HTMLElement>(trigger: unknown) {
    const containerRef = useRef<T | null>(null);
    const stickToBottomRef = useRef(true);

    const onScroll = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
    }, []);

    const scrollToBottom = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        stickToBottomRef.current = true;
        element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }, []);

    useEffect(() => {
        const element = containerRef.current;
        if (element && stickToBottomRef.current) {
            element.scrollTop = element.scrollHeight;
        }
    }, [trigger]);

    return { containerRef, onScroll, scrollToBottom };
}
