/**
 * API Configuration
 * Automatically uses localhost in development and production URL in builds
 */

// Get the API version from the build (defaults to v1)
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';

// Get the base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://chooser.shatuga.com';

// Construct the full API URL
export const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

// Export individual parts in case they're needed
export const BASE_URL = API_BASE_URL;
export const VERSION = API_VERSION;

// Helper function for making API requests
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  const response = await fetch(url, { ...defaultOptions, ...options });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
