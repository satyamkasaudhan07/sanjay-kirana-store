/**
 * Phone Number Normalization and Validation Utilities for Sanjay Kirana Store.
 * 
 * Supports:
 * - Plain 10-digit Indian numbers: "9554384886"
 * - International prefixed numbers: "+919554384886", "919554384886"
 * - Numbers with spaces/hyphens: "+91 95543 84886", "+91-95543-84886"
 * - Numbers with leading zero: "09554384886"
 * - Duplicate country code prefixes: "+91+919554384886", "91919554384886"
 * 
 * Guarantees that:
 * 1. Domestic Indian format is exactly 10 digits starting with 6–9.
 * 2. MSG91 API format is exactly 12 digits starting with 91 followed by the 10 digits.
 * 3. Formatted display is "+91 XXXXX XXXXX".
 */

export function normalizeIndianPhone(rawPhone) {
    if (!rawPhone || typeof rawPhone !== "string") {
        return {
            isValid: false,
            domestic: "",
            international: "",
            e164: "",
            formatted: "",
            error: "Please enter a valid phone number.",
        };
    }

    const trimmed = rawPhone.trim();
    if (!trimmed) {
        return {
            isValid: false,
            domestic: "",
            international: "",
            e164: "",
            formatted: "",
            error: "Phone number cannot be blank.",
        };
    }

    // Extract digits only
    let digits = trimmed.replace(/\D/g, "");

    // Iteratively strip leading zeros and duplicate 91 prefixes
    let changed = true;
    while (changed) {
        changed = false;
        // Strip leading zeros if more than 10 digits
        if (digits.startsWith("0") && digits.length > 10) {
            digits = digits.replace(/^0+/, "");
            changed = true;
        }
        // Strip leading 91 country code if remaining length is at least 10
        if (digits.length > 10 && digits.startsWith("91")) {
            digits = digits.slice(2);
            changed = true;
        }
    }

    // If still has a leading single 0 and length is 11, strip it (e.g. 09554384886)
    if (digits.startsWith("0") && digits.length === 11) {
        digits = digits.slice(1);
    }

    // Validate 10-digit length
    if (digits.length !== 10) {
        return {
            isValid: false,
            domestic: "",
            international: "",
            e164: "",
            formatted: "",
            error: `Invalid phone length (${digits.length} digits). Must be a 10-digit Indian mobile number.`,
        };
    }

    // Validate valid Indian mobile prefixes (6, 7, 8, 9)
    if (!/^[6-9]\d{9}$/.test(digits)) {
        return {
            isValid: false,
            domestic: "",
            international: "",
            e164: "",
            formatted: "",
            error: "Invalid Indian mobile number. Must start with digits 6, 7, 8, or 9.",
        };
    }

    const domestic = digits;
    const international = `91${digits}`;
    const e164 = `+91${digits}`;
    const formatted = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

    return {
        isValid: true,
        domestic,
        international,
        e164,
        formatted,
        error: "",
    };
}

