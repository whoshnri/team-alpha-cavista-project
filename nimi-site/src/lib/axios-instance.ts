import axios from 'axios';
import Cookies from 'js-cookie';

const getBaseURL = () => {
    const url = process.env.NEXT_PUBLIC_API_URL || '';
    if (url && !url.startsWith('http')) {
        return `http://${url}`;
    }
    return url;
}

const axiosInstance = axios.create({
    baseURL: getBaseURL(),
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
    },
});

const getRequestRoute = () => {
    if (typeof window !== 'undefined') {
        return window.location.pathname;
    }
    return '';
}

// Request interceptor for API calls except login and signup routes
axiosInstance.interceptors.request.use(
    (config) => {
        const startTime = Date.now();
        (config as any).metadata = { startTime };

        const route = getRequestRoute();

        // Logging the request
        console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`, {
            headers: config.headers,
            params: config.params,
            data: config.data ? { ...config.data, password: config.data.password ? '***' : undefined } : undefined,
            route
        });

        if (route === '/login' || route === '/signup') {
            return config;
        }
        const token = Cookies.get('nimi_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        console.error(`[API REQUEST ERROR]`, error);
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => {
        const duration = Date.now() - (response.config as any).metadata.startTime;
        console.log(`[API RESPONSE] ${response.status} ${response.config.url} (${duration}ms)`, {
            data: response.data
        });
        return response;
    },
    (error) => {
        const duration = error.config ? Date.now() - (error.config as any).metadata.startTime : 'N/A';
        console.error(`[API ERROR] ${error.response?.status || 'NETWORK'} ${error.config?.url} (${duration}ms)`, {
            error: error.message,
            response: error.response?.data
        });

        if (error.response && error.response.status === 404) {
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
