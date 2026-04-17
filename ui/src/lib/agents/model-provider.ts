/**
 * Model Provider Abstraction
 * 
 * Supports multiple LLM backends:
 * - gemini: Google Gemini API (cloud)
 * - ollama: Local Ollama server (recommended for Mac Mini)
 * - llamacpp: Local llama.cpp server
 * 
 * Configure via environment variables:
 * - MODEL_PROVIDER: 'gemini' | 'ollama' | 'llamacpp'
 * - OLLAMA_URL: Ollama server URL (default: http://localhost:11434/v1/chat/completions)
 * - OLLAMA_MODEL: Model name (default: qwen2.5:7b)
 * - LLAMACPP_URL: llama.cpp server URL (default: http://localhost:8080/v1/chat/completions)
 */

export interface ModelConfig {
    endpoint: string;
    headers: Record<string, string>;
    model: string;
    provider: string;
}

export type ModelProvider = 'gemini' | 'ollama' | 'llamacpp';

export function getModelProvider(): ModelProvider {
    const provider = process.env.MODEL_PROVIDER || 'gemini';
    if (provider === 'ollama' || provider === 'llamacpp' || provider === 'gemini') {
        return provider;
    }
    return 'gemini';
}

export function getModelConfig(): ModelConfig {
    const provider = getModelProvider();

    switch (provider) {
        case 'ollama':
            return {
                endpoint: process.env.OLLAMA_URL || 'http://localhost:11434/v1/chat/completions',
                headers: { 'Content-Type': 'application/json' },
                model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
                provider: 'ollama'
            };

        case 'llamacpp':
            return {
                endpoint: process.env.LLAMACPP_URL || 'http://localhost:8080/v1/chat/completions',
                headers: { 'Content-Type': 'application/json' },
                model: process.env.LLAMACPP_MODEL || 'local',
                provider: 'llamacpp'
            };

        case 'gemini':
        default:
            if (!process.env.GEMINI_API_KEY) {
                console.warn('[model-provider] GEMINI_API_KEY not set, API calls will fail');
            }
            return {
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`
                },
                model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                provider: 'gemini'
            };
    }
}

export function getProviderDisplayName(): string {
    const config = getModelConfig();
    switch (config.provider) {
        case 'ollama':
            return `Ollama (${config.model})`;
        case 'llamacpp':
            return `llama.cpp (${config.model})`;
        case 'gemini':
            return `Gemini (${config.model})`;
        default:
            return config.provider;
    }
}
