/**
 * Utility functions for handling images in posts and comments
 */

/**
 * Validates if a string is a valid image URL
 */
export const isValidImageUrl = (url: string): boolean => {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const pathname = urlObj.pathname.toLowerCase();
    
    return validExtensions.some(ext => pathname.endsWith(ext)) || 
           pathname.includes('/image/') ||
           urlObj.hostname.includes('imgur') ||
           urlObj.hostname.includes('giphy');
  } catch {
    return false;
  }
};

/**
 * Converts a relative image path to absolute URL
 */
export const getAbsoluteImageUrl = (imagePath: string, baseUrl: string): string => {
  if (!imagePath) return '';
  
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

/**
 * Validates image file size (for future file upload implementation)
 */
export const validateImageFile = (file: File, maxSizeMB: number = 5): { valid: boolean; error?: string } => {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Please upload JPG, PNG, GIF, or WebP.' };
  }
  
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: `File size must be less than ${maxSizeMB}MB.` };
  }
  
  return { valid: true };
};

/**
 * Converts File to base64 string (for future file upload implementation)
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/**
 * Extracts image dimensions from URL
 */
export const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
};
