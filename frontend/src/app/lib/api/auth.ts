import { API_BASE_URL } from './config';

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  nickname: string;
  dateOfBirth: string;
  aboutMe: string;
  avatarUrl: string;
  createdAt: string;
  following: number;
  followers: number;
  isFollowed: boolean;
  notifications: number;
  isPublic?: boolean;
  followState?: string;
  isFollowing?: boolean;
  isPending?: boolean;
}


// Check if user is logged in
export const checkAuth = async (): Promise<{ isLoggedIn: boolean; user: User | null }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/check-session`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.isLoggedIn && data.user) {
        // Convert relative avatar path to full URL
        if (data.user.avatar && !data.user.avatar.startsWith('http')) {
          data.user.avatarUrl = `${API_BASE_URL}${data.user.avatar}`;
        } else {
          data.user.avatarUrl = data.user.avatar || '';
        }
      }
      return { isLoggedIn: data.isLoggedIn, user: data.user };
    } else {
      console.error('Check session failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Request returned an error response');
      return { isLoggedIn: false, user: null };
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    return { isLoggedIn: false, user: null };
  }
};

// Logout user
export const logout = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });

    return response.ok;
  } catch (error) {
    console.error("Error during logout:", error);
    return false;
  }
};


export const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // SEND "email"FIELD, NOT "emailOrUsername"
      body: JSON.stringify({ email: email, password }),
      credentials: "include",
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse response JSON");
      return { success: false, error: "Server returned an invalid response" };
    }

    if (!response.ok) {
      return { success: false, error: data.error || "An error occurred during Login" };
    }

    if (!data.success || !data.user) {
      return { success: false, error: "Invalid response from server" };
    }

    // Convert relative avatar path to full URL
    if (data.user.avatar && !data.user.avatar.startsWith('http')) {
      data.user.avatarUrl = `${API_BASE_URL}${data.user.avatar}`;
    } else {
      data.user.avatarUrl = data.user.avatar || '';
    }

    return { success: true, user: data.user };
  } catch (error) {
    console.error("Error during Login:", error);
    return { success: false, error: "An error occurred during Login. Please try again." };
  }
};


export const signup = async (formData: FormData): Promise<{ success: boolean; error?: string; user?: User }> => {
  try {
    
    // Create JSON data object
    const jsonData: {
      username: string;
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      nickname?: string;
      aboutMe?: string;
    } = {
      username: formData.get('username') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      dateOfBirth: formData.get('dateOfBirth') as string,
    };
    
    // Add optional fields if they exist and are not empty
    const nickname = formData.get('nickname') as string;
    const aboutMe = formData.get('aboutMe') as string;
    
    if (nickname && nickname.trim()) {
      jsonData.nickname = nickname.trim();
    }
    
    if (aboutMe && aboutMe.trim()) {
      jsonData.aboutMe = aboutMe.trim();
    }
    
    // Create new FormData for the API call
    const apiFormData = new FormData();
    
    // Add JSON data as a string field (named "data" as backend expects)
    apiFormData.append('data', JSON.stringify(jsonData));
    
    // Add avatar file if it exists in the formData
    const avatarFile = formData.get('avatar') as File;
    if (avatarFile && avatarFile.size > 0) {
      apiFormData.append('avatar', avatarFile);
    }
    
    
    // Send as FormData (NOT JSON)
    const response = await fetch(`${API_BASE_URL}/signup`, {
      method: 'POST',
      body: apiFormData, // back  Send FormData, NOT JSON.stringify
      credentials: 'include',
    });
    
    
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "An error occurred during signup" };
    }

    if (!data.success || !data.user) {
      return { success: false, error: "Invalid response from server" };
    }

    // Convert relative avatar path to full URL
    if (data.user.avatar && !data.user.avatar.startsWith('http')) {
      data.user.avatarUrl = `${API_BASE_URL}${data.user.avatar}`;
    } else {
      data.user.avatarUrl = data.user.avatar || '';
    }

    return { success: true, user: data.user };
  } catch (error) {
    console.error("Error during signup:", error);
    return { success: false, error: "An error occurred during signup. Please try again." };
  }
};