/**
 * Normalizes a phone number to E.164 format.
 * Defaulting to Nigerian (+234) if no country code is provided.
 * 
 * @param phoneNumber The raw phone number string
 * @returns Standardized phone number (e.g., +2348012345678)
 */
export function normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters except for the leading '+'
    let cleaned = phoneNumber.replace(/(?!^\+)\D/g, "");

    // If it starts with '0' and has no '+', assume Nigerian and replace '0' with '+234'
    if (cleaned.startsWith("0")) {
        cleaned = "+234" + cleaned.substring(1);
    }

    // If it's a 10-digit number without a leading '+', assume Nigerian
    if (cleaned.length === 10 && !cleaned.startsWith("+")) {
        cleaned = "+234" + cleaned;
    }

    // If it doesn't start with '+', add it (assuming it already includes a country code or needs one)
    if (!cleaned.startsWith("+")) {
        // More sophisticated logic could be added here if other countries need to be supported.
        // For now, if it's 11 digits and doesn't start with 0 or +, we assume it might already be 234...
        if (cleaned.startsWith("234")) {
            cleaned = "+" + cleaned;
        } else {
            cleaned = "+234" + cleaned;
        }
    }

    return cleaned;
}
