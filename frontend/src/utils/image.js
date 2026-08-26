/**
 * Returns a standardized URL for product images.
 * Ensures leading slash for Vite public folder assets while preserving
 * external URLs and already-formatted paths.
 *
 * @param {string} imagePath - The image path from DB, static data, or props.
 * @returns {string} - Formatted image URL ready for <img src="...">
 */
export function getProductImageUrl(imagePath) {
    if (!imagePath || typeof imagePath !== "string") {
        return "";
    }

    const trimmed = imagePath.trim();

    // Preserve external, absolute network URLs or data URIs
    if (
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("data:") ||
        trimmed.startsWith("blob:")
    ) {
        return trimmed;
    }

    // Ensure single leading slash for Vite public assets
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
