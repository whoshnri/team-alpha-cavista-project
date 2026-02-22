import Cookies from "js-cookie";

export const API_BASE_URL = process.env.API_URL || "";

export const getAuthHeaders = () => {
    const token = Cookies.get("preventiq_token");
    return {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
};
