// Normalize a flashcard front so we can reject near-duplicates across batches
// without dragging in embeddings. Intentionally simple — lowercase, trim,
// collapse whitespace, and strip common trailing punctuation so "What is x?"
// and "what is x" collide.
export function normalizeFront(s: string): string {
    return s
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.?!,;:]+$/, "");
}
