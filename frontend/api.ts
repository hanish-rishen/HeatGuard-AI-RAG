import axios from 'axios';

// --- Types matching Backend Schemas ---

export interface DistrictData {
    district_name: string;
    max_temp: number; // °C
    lst: number; // °C
    humidity: number; // %
    pct_children: number; // %
    pct_outdoor_workers: number; // %
    pct_vulnerable_social: number; // %
    date: string; // YYYY-MM-DD
}

export interface AnalysisRequest {
    district_data: DistrictData;
}

export interface SourceDocument {
    content: string;
    source: string;
    page?: number;
    similarity_score: number;
}

export interface AnalysisResponse {
    predicted_hospitalization_load: number;
    heat_index: number;
    lst: number;
    risk_status: 'Green' | 'Amber' | 'Red';
    risk_level_description: string;
    prescriptive_advice: string;
    source_documents: SourceDocument[];
    district_name: string;
    analysis_date: string;
    model_version: string;
}

export interface HealthCheckResponse {
    status: string;
    model_loaded: boolean;
    chroma_connected: boolean;
    version: string;
}

export interface DistrictRanking {
    district_name: string;
    state?: string | null;
    lat: number;
    lon: number;
    risk_score: number;
    risk_status: 'Green' | 'Amber' | 'Red';
    heat_index: number;
    max_temp: number;
    humidity: number;
    lst: number;
    pct_children: number;
    pct_outdoor_workers: number;
    pct_vulnerable_social: number;
    mortality_risk_score?: number | null;
    mortality_risk_reason?: string | null;
    mortality_disease_index?: number | null;
    date?: string; // Added optional date for historical data
}


export interface MortalityRiskItem {
    district_name: string;
    heat_risk_score: number;
    heat_risk_date?: string | null;
    mortality_risk_score: number;
    mortality_disease_index: number;
    mortality_risk_reason?: string | null;
}

export interface MortalityRiskResponse {
    total_districts: number;
    as_of_date?: string | null;
    items: MortalityRiskItem[];
}

export interface RankingsResponse {
    date: string;
    total_districts: number;
    rankings: DistrictRanking[];
}

export interface UploadedFile {
    id: number;
    filename: string;
    upload_date: string;
    size_bytes: number;
    content_type: string;
    description: string;
    status: string;
}

export interface DocumentUploadResponse {
    filename: string;
    status: string;
    message: string;
    chunks_processed: number;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

// --- API Client ---

const API_BASE_URL = 'http://localhost:8080/api';
const AUTH_STORAGE_KEY = 'heatguard_auth_token_v1';

const getTokenSafe = () => {
    try {
        return localStorage.getItem(AUTH_STORAGE_KEY);
    } catch (err) {
        console.warn("Local storage unavailable for auth token.", err);
        return null;
    }
};

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = getTokenSafe();
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const HeatGuardAPI = {
    getRankingsStreamUrl: (token?: string | null) => {
        if (token) {
            return `${API_BASE_URL}/districts/rankings?token=${encodeURIComponent(token)}`;
        }
        return `${API_BASE_URL}/districts/rankings`;
    },
    login: async (username: string, password: string): Promise<TokenResponse> => {
        const response = await api.post<TokenResponse>('/auth/login', { username, password });
        if (response.data?.access_token) {
            try {
                localStorage.setItem(AUTH_STORAGE_KEY, response.data.access_token);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('heatguard-auth'));
                }
            } catch (err) {
                console.warn("Unable to persist auth token.", err);
            }
        }
        return response.data;
    },
    verifyAuth: async (): Promise<boolean> => {
        try {
            await api.get('/auth/verify', { timeout: 4000 });
            return true;
        } catch {
            return false;
        }
    },
    logout: () => {
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('heatguard-auth'));
            }
        } catch (err) {
            console.warn("Unable to clear auth token.", err);
        }
    },
    getStoredToken: () => {
        return getTokenSafe();
    },
    // Check backend health
    checkHealth: async (): Promise<HealthCheckResponse> => {
        const response = await api.get<HealthCheckResponse>('/health');
        return response.data;
    },

    // Seed default data if needed
    seedData: async (): Promise<{ message: string }> => {
        const response = await api.post('/seed_data');
        return response.data;
    },

    // Main Analysis Endpoint
    analyzeDistrict: async (data: DistrictData): Promise<AnalysisResponse> => {
        const response = await api.post<AnalysisResponse>('/analyze', { district_data: data });
        return response.data;
    },

    // Get all district rankings (auto-fetched data)
    getDistrictRankings: async (): Promise<RankingsResponse> => {
        const response = await api.get<RankingsResponse>('/rankings');
        return response.data;
    },

    // Get trend history for a district
    getDistrictHistory: async (districtName: string, limit: number = 30): Promise<DistrictRanking[]> => {
        const response = await api.get<DistrictRanking[]>(`/districts/${encodeURIComponent(districtName)}/history?limit=${encodeURIComponent(String(limit))}`);
        return response.data;
    },

    
    getMortalityRisk: async (): Promise<MortalityRiskResponse> => {
        const response = await api.get<MortalityRiskResponse>('/mortality-risk');
        return response.data;
    },

    getFiles: async (): Promise<UploadedFile[]> => {
        const response = await api.get<UploadedFile[]>('/files');
        return response.data;
    },

    uploadFile: async (file: File, onProgress?: (progress: number) => void): Promise<DocumentUploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<DocumentUploadResponse>('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    if (onProgress) onProgress(percentCompleted);
                }
            },
        });
        return response.data;
    },

    deleteFile: async (filename: string): Promise<void> => {
        await api.delete(`/files/${encodeURIComponent(filename)}`);
    },
};



