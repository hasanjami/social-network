import { API_BASE_URL } from './config';
import { User } from './auth';

// Backend user response may have 'avatar' field instead of 'avatarUrl'
interface BackendUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  nickname: string;
  dateOfBirth: string;
  aboutMe: string;
  avatar?: string;
  createdAt: string;
  following?: number;
  followers?: number;
  isFollowed?: boolean;
  notifications?: number;
}

export interface ProfileResponse {
  user: User;
  followers: number;
  following: number;
  postCount: number;
  isFollowing: boolean;
  isPending: boolean;
  isOwnProfile: boolean;
  canView: boolean;
}

export const getUserProfile = async (username: string): Promise<ProfileResponse | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/${encodeURIComponent(username)}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to load profile:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data || !data.user) {
      return null;
    }

    // Convert relative avatar path to full URL
    let avatarUrl = '';
    if (data.user.avatar && !data.user.avatar.startsWith('http')) {
      avatarUrl = `${API_BASE_URL}${data.user.avatar}`;
    } else {
      avatarUrl = data.user.avatar || '';
    }

    // `data.stats` may contain followers/following/postCount/notifications
    const profile: ProfileResponse = {
      user: {
        ...data.user,
        avatarUrl: avatarUrl,
        followers: data.stats?.followers || 0,
        following: data.stats?.following || 0,
        // notifications isn't really needed on other profiles but keep it for own profile
        notifications: data.stats?.notifications || 0,
      } as User,
      followers: data.stats?.followers || 0,
      following: data.stats?.following || 0,
      postCount: data.stats?.postCount || 0,
      isFollowing: data.isFollowing || false,
      isPending: data.isPending || false,
      isOwnProfile: data.isOwnProfile || false,
      canView: data.canView || false,
    };

    return profile;
  } catch (err) {
    console.error('Error getting user profile:', err);
    return null;
  }
};

export const followUser = async (followedId: number): Promise<{ success: boolean; status?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ followedId }),
    });
    const data = await response.json();
    return { success: response.ok && data.success, status: data.status };
  } catch (err) {
    console.error('followUser error', err);
    return { success: false };
  }
};

export const unfollowUser = async (followedId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/unfollow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ followedId }),
    });
    const data = await response.json();
    return response.ok && data.success;
  } catch (err) {
    console.error('unfollowUser error', err);
    return false;
  }
};

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  aboutMe?: string;
  isPublic?: boolean;
  avatar?: File;
}

export const updateUserProfile = async (data: UpdateProfileData): Promise<{ success: boolean; error?: string; user?: User }> => {
  try {
    const formData = new FormData();
    
    // Add text fields if they exist
    if (data.firstName !== undefined) formData.append('firstName', data.firstName);
    if (data.lastName !== undefined) formData.append('lastName', data.lastName);
    if (data.nickname !== undefined) formData.append('nickname', data.nickname);
    if (data.aboutMe !== undefined) formData.append('aboutMe', data.aboutMe);
    if (data.isPublic !== undefined) formData.append('isPublic', data.isPublic.toString());
    
    // Add avatar file if provided (backend expects 'profileImg')
    if (data.avatar) {
      formData.append('profileImg', data.avatar);
    }

    const response = await fetch(`${API_BASE_URL}/api/user/update`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to update profile' };
    }

    // Convert relative avatar path to full URL if present
    if (result.user && result.user.avatar && !result.user.avatar.startsWith('http')) {
      result.user.avatarUrl = `${API_BASE_URL}${result.user.avatar}`;
    } else if (result.user) {
      result.user.avatarUrl = result.user.avatar || '';
    }

    return { success: true, user: result.user };
  } catch (error) {
    console.error('Error updating profile:', error);
    return { success: false, error: 'An error occurred while updating profile' };
  }
};

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to fetch users:', response.status);
      return [];
    }

    const users = await response.json();
    
    // Backend returns 'avatar' field (relative path), map to 'avatarUrl' (full URL)
    return users.map((user: User & { avatar?: string }) => ({
      ...user,
      avatarUrl: user.avatar && !user.avatar.startsWith('http') 
        ? `${API_BASE_URL}${user.avatar}` 
        : user.avatar || '',
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

export const searchUsers = async (query: string): Promise<User[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}&limit=20`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      console.error('Failed to search users:', response.status);
      return [];
    }

    const users = await response.json();
    
    // Backend returns 'avatar' field (relative path), map to 'avatarUrl' (full URL)
    return users.map((user: User & { avatar?: string }) => ({
      ...user,
      avatarUrl: user.avatar && !user.avatar.startsWith('http') 
        ? `${API_BASE_URL}${user.avatar}` 
        : user.avatar || '',
    }));
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};

export const acceptFollowRequest = async (followerId: number): Promise<{ success: boolean; acceptorFollowerCount?: number; requesterFollowingCount?: number }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/follow/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ followerId }),
    });
    const data = await response.json();
    return { 
      success: response.ok && data.success,
      acceptorFollowerCount: data.acceptorFollowerCount,
      requesterFollowingCount: data.requesterFollowingCount
    };
  } catch (error) {
    console.error('acceptFollowRequest error', error);
    return { success: false };
  }
};

export const declineFollowRequest = async (followerId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/follow/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ followerId }),
    });
    const data = await response.json();
    return response.ok && data.success;
  } catch (error) {
    console.error('declineFollowRequest error', error);
    return false;
  }
};

export const getPendingFollowRequests = async (): Promise<User[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/follow/pending`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to fetch pending requests:', response.status);
      return [];
    }

    const data = await response.json();
    const requests = data.requests || [];
    
    // Convert relative avatar paths to full URLs
    return requests.map((user: BackendUser) => ({
      ...user,
      avatarUrl: user.avatar && !user.avatar.startsWith('http') 
        ? `${API_BASE_URL}${user.avatar}` 
        : user.avatar || '',
    }));
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    return [];
  }
};

export const getFollowers = async (userId?: number): Promise<User[]> => {
  try {
    const url = userId 
      ? `${API_BASE_URL}/api/followers?user_id=${userId}`
      : `${API_BASE_URL}/api/followers`;
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to fetch followers:', response.status);
      return [];
    }

    const data = await response.json();
    const followers = data.followers || [];
    
    // Convert relative avatar paths to full URLs
    return followers.map((user: BackendUser) => ({
      ...user,
      avatarUrl: user.avatar && !user.avatar.startsWith('http') 
        ? `${API_BASE_URL}${user.avatar}` 
        : user.avatar || '',
    }));
  } catch (error) {
    console.error('Error fetching followers:', error);
    return [];
  }
};

export const getFollowing = async (userId?: number): Promise<User[]> => {
  try {
    const url = userId 
      ? `${API_BASE_URL}/api/following?user_id=${userId}`
      : `${API_BASE_URL}/api/following`;
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to fetch following:', response.status);
      return [];
    }

    const data = await response.json();
    const following = data.following || [];
    
    // Convert relative avatar paths to full URLs
    return following.map((user: BackendUser) => ({
      ...user,
      avatarUrl: user.avatar && !user.avatar.startsWith('http') 
        ? `${API_BASE_URL}${user.avatar}` 
        : user.avatar || '',
    }));
  } catch (error) {
    console.error('Error fetching following:', error);
    return [];
  }
};
