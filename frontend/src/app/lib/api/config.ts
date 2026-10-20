export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const getAuthHeaders = (): Record<string, string> => {
  return {
    "Content-Type": "application/json",
  };
};
